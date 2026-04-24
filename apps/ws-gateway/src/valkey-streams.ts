// apps/ws-gateway/src/valkey-streams.ts
import type Valkey from 'iovalkey';
import os from 'node:os';
import { ConnectionManager, WsClient, UWS_SEND_BACKPRESSURE, UWS_SEND_DROPPED } from './connection-manager.js';
import type { Logger } from '@crypto-platform/logger';
import {
  wsMessagesSentCounter,
  wsBackpressureDropsCounter,
  wsMessageLatencyHistogram,
} from '@crypto-platform/metrics';

const CHANNEL_MAP: Record<string, string> = {
  'agg:ticker': 'ticker',
  'agg:candle': 'candle',
  'trades:stream': 'trades',
  'trades:large': 'trades_large',
  'trades:delta': 'trades_delta',
  'deriv:oi': 'deriv_oi',
  'deriv:fund': 'deriv_fund',
  'deriv:liq': 'deriv_liq',
  'whale:event': 'whale_event',
  'screener:update': 'screener_update',
  'options:update': 'options_update',
  'etf:latest': 'etf_latest',
  'system:status': 'system_status',
};

const STREAM_KEYS = Object.keys(CHANNEL_MAP);
const CONSUMER_GROUP = 'ws-gateway';
const CONSUMER_NAME = `${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = 100;
const BLOCK_MS = 100;
const COUNT = 100;

export class ValkeyStreams {
  private subscriber: Valkey;
  private isRunning = true;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;

  constructor(
    valkeyOpts: { host: string; port: number },
    private readonly connectionManager: ConnectionManager,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'ValkeyStreams' });
    this.subscriber = new (require('iovalkey').default ?? require('iovalkey'))(valkeyOpts);

    this.subscriber.on('error', (err: Error) => {
      this.logger.error({ err }, 'ValkeyStreams subscriber error');
    });

    this.subscriber.on('ready', async () => {
      this.logger.info('Valkey subscriber ready, setting up consumer groups');
      try {
        await this.initializeConsumerGroups();
        await this.processPendingMessages();
        // FIX: проверка что цикл не запущен — предотвращает двойной поллинг при reconnect
        if (!this.pollTimer) {
          this.startPollingLoop();
        } else {
          this.logger.warn('Polling loop already running, skipping duplicate start on reconnect');
        }
      } catch (err) {
        this.logger.error({ err }, 'Failed to initialize streams');
      }
    });
  }

  private async initializeConsumerGroups(): Promise<void> {
    for (const stream of STREAM_KEYS) {
      try {
        await this.subscriber.xgroup('CREATE', stream, CONSUMER_GROUP, '$', 'MKSTREAM');
        this.logger.info({ stream }, 'Consumer group created');
      } catch (err: any) {
        if (err.message && !err.message.includes('BUSYGROUP')) {
          this.logger.error({ stream, err }, 'Failed to create consumer group');
        }
      }
    }
  }

  private async processPendingMessages(): Promise<void> {
    try {
      const streams = STREAM_KEYS.map((s) => ({ key: s, id: '0' }));
      const results = await this.subscriber.xreadgroup(
        'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
        'COUNT', COUNT,
        'BLOCK', BLOCK_MS,
        'STREAMS',
        ...streams.map((s) => s.key),
        ...streams.map((s) => s.id)
      );
      if (results) {
        await this.handleStreamResults(results);
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to read pending messages');
    }
  }

  private startPollingLoop(): void {
    this.pollTimer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        const streams = STREAM_KEYS.map((s) => ({ key: s, id: '>' }));
        const results = await this.subscriber.xreadgroup(
          'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
          'COUNT', COUNT,
          'BLOCK', BLOCK_MS,
          'STREAMS',
          ...streams.map((s) => s.key),
          ...streams.map((s) => s.id)
        );
        if (results) {
          await this.handleStreamResults(results);
        }
      } catch (err: any) {
        if (err.message && err.message.includes('NORECONNECT')) {
          this.logger.warn('Valkey connection lost during poll');
        } else {
          this.logger.error({ err }, 'Stream polling error');
        }
      }
    }, POLL_INTERVAL_MS);
  }

  private async handleStreamResults(results: any): Promise<void> {
    if (!Array.isArray(results)) return;

    for (const streamData of results) {
      const [streamKey, messages] = streamData;
      const wsChannel = CHANNEL_MAP[streamKey];
      if (!wsChannel) {
        this.logger.warn({ streamKey }, 'Unknown stream, skipping');
        continue;
      }
      if (!messages || messages.length === 0) continue;

      const clients = this.connectionManager.getByChannel(wsChannel);
      // FIX: батчевый XACK для всех сообщений потока вместо последовательных roundtrip
      const msgIds: string[] = [];

      if (clients.length === 0) {
        for (const msg of messages) msgIds.push(msg[0]);
        if (msgIds.length > 0) {
          await this.subscriber.xack(streamKey, CONSUMER_GROUP, ...msgIds);
        }
        continue;
      }

      const now = Date.now();

      for (const msg of messages) {
        const msgId = msg[0];
        const fields = msg[1];
        let data: any = null;

        try {
          const dataIndex = fields.indexOf('data');
          if (dataIndex >= 0 && dataIndex + 1 < fields.length) {
            data = JSON.parse(fields[dataIndex + 1]);
          } else {
            data = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i]] = fields[i + 1];
            }
          }
        } catch (parseError) {
          this.logger.warn({ streamKey, msgId }, 'Failed to parse message data, XACKing anyway');
          msgIds.push(msgId);
          continue;
        }

        const payload = JSON.stringify({ type: wsChannel, data });
        const messageTs = data?.ts ? new Date(data.ts).getTime() : undefined;

        for (const client of clients) {
          if (!client.ws) continue;
          const sendResult = client.ws.send(payload);

          if (sendResult === UWS_SEND_BACKPRESSURE || sendResult === UWS_SEND_DROPPED) {
            wsBackpressureDropsCounter.inc({ channel: wsChannel });
          } else {
            wsMessagesSentCounter.inc({ channel: wsChannel });
            if (messageTs) {
              const latencyMs = now - messageTs;
              if (latencyMs >= 0) {
                wsMessageLatencyHistogram.observe({ channel: wsChannel }, latencyMs);
              }
            }
          }
          this.connectionManager.updatePing(client.id);
        }

        msgIds.push(msgId);
      }

      // FIX: один XACK для всего потока — 100x меньше roundtrip'ов
      if (msgIds.length > 0) {
        await this.subscriber.xack(streamKey, CONSUMER_GROUP, ...msgIds);
      }
    }
  }

  async close(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    try {
      this.subscriber.quit();
      this.logger.info('ValkeyStreams subscriber closed');
    } catch (err) {
      this.logger.error({ err }, 'Error closing ValkeyStreams subscriber');
    }
  }
}
