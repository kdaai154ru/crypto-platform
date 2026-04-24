// apps/ws-gateway/src/valkey-streams.ts
import Valkey from 'iovalkey';
import os from 'node:os';
import { ConnectionManager, UWS_SEND_BACKPRESSURE, UWS_SEND_DROPPED } from './connection-manager.js';
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

interface StreamMessage {
  type: string;
  data: unknown;
}

export class ValkeyStreams {
  private subscriber: Valkey;
  private isRunning = true;
  private logger: Logger;

  constructor(
    valkeyOpts: { host: string; port: number; retryStrategy?: (times: number) => number },
    private readonly connectionManager: ConnectionManager,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'ValkeyStreams' });
    // FIX #1: ESM import вместо require() — устраняет ReferenceError в ESM-контексте
    this.subscriber = new Valkey(valkeyOpts);

    this.subscriber.on('error', (err: Error) => {
      this.logger.error({ err }, 'ValkeyStreams subscriber error');
    });

    this.subscriber.on('ready', async () => {
      this.logger.info('Valkey subscriber ready, setting up consumer groups');
      try {
        await this.initializeConsumerGroups();
        // FIX #2: processPendingMessages без BLOCK — не блокирует event loop при reconnect
        await this.processPendingMessages();
        // FIX #3: pollLoop через рекурсивный setTimeout — исключает параллельные итерации
        if (this.isRunning) {
          this.pollLoop();
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
      } catch (err: unknown) {
        const e = err as Error;
        if (e.message && !e.message.includes('BUSYGROUP')) {
          this.logger.error({ stream, err }, 'Failed to create consumer group');
        }
      }
    }
  }

  // FIX #2: БЕЗ BLOCK — читаем накопившиеся pending сообщения (id='0') синхронно
  private async processPendingMessages(): Promise<void> {
    try {
      const streamKeys = STREAM_KEYS;
      const ids = streamKeys.map(() => '0');
      const results = await this.subscriber.xreadgroup(
        'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
        'COUNT', COUNT,
        'STREAMS',
        ...streamKeys,
        ...ids
      );
      if (results) {
        await this.handleStreamResults(results);
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to read pending messages');
    }
  }

  // FIX #3: рекурсивный цикл через await + setTimeout вместо setInterval+async
  // Гарантирует: следующая итерация начинается ТОЛЬКО после завершения текущей
  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const streamKeys = STREAM_KEYS;
        const ids = streamKeys.map(() => '>');
        const results = await this.subscriber.xreadgroup(
          'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
          'COUNT', COUNT,
          'BLOCK', BLOCK_MS,
          'STREAMS',
          ...streamKeys,
          ...ids
        );
        if (results) {
          await this.handleStreamResults(results);
        }
      } catch (err: unknown) {
        const e = err as Error;
        if (e.message?.includes('NORECONNECT') || e.message?.includes('Connection is closed')) {
          this.logger.warn('Valkey connection lost during poll, waiting for reconnect');
          // При потере соединения ждём дольше чтобы не спамить
          await new Promise(r => setTimeout(r, 1000));
        } else {
          this.logger.error({ err }, 'Stream polling error');
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        }
      }
    }
    this.logger.info('pollLoop stopped');
  }

  private async handleStreamResults(results: unknown): Promise<void> {
    if (!Array.isArray(results)) return;

    for (const streamData of results as Array<[string, Array<[string, string[]]>]>) {
      const [streamKey, messages] = streamData;
      const wsChannel = CHANNEL_MAP[streamKey];
      if (!wsChannel) {
        this.logger.warn({ streamKey }, 'Unknown stream, skipping');
        continue;
      }
      if (!messages || messages.length === 0) continue;

      const clients = this.connectionManager.getByChannel(wsChannel);
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
        let data: Record<string, unknown> | null = null;

        try {
          const dataIndex = fields.indexOf('data');
          if (dataIndex >= 0 && dataIndex + 1 < fields.length) {
            data = JSON.parse(fields[dataIndex + 1] as string) as Record<string, unknown>;
          } else {
            data = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i] as string] = fields[i + 1];
            }
          }
        } catch (parseError) {
          this.logger.warn({ streamKey, msgId }, 'Failed to parse message data, XACKing anyway');
          msgIds.push(msgId);
          continue;
        }

        const outgoing: StreamMessage = { type: wsChannel, data };
        const payload = JSON.stringify(outgoing);
        const messageTs = typeof data?.ts === 'number' ? data.ts : undefined;

        for (const client of clients) {
          if (!client.ws) continue;
          const sendResult = client.ws.send(payload);

          if (sendResult === UWS_SEND_BACKPRESSURE || sendResult === UWS_SEND_DROPPED) {
            wsBackpressureDropsCounter.inc({ channel: wsChannel });
          } else {
            wsMessagesSentCounter.inc({ channel: wsChannel });
            if (messageTs !== undefined) {
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

      // Батчевый XACK для всего потока — один roundtrip
      if (msgIds.length > 0) {
        await this.subscriber.xack(streamKey, CONSUMER_GROUP, ...msgIds);
      }
    }
  }

  async close(): Promise<void> {
    this.isRunning = false;
    try {
      await this.subscriber.quit();
      this.logger.info('ValkeyStreams subscriber closed');
    } catch (err) {
      this.logger.error({ err }, 'Error closing ValkeyStreams subscriber');
    }
  }
}
