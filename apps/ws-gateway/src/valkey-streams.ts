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
const BLOCK_MS = 100;
const COUNT = 100;
const POLL_INTERVAL_MS = 1000;

// FIX: PEL dead-letter constants
const PEL_CLAIM_IDLE_MS = 60_000;     // сообщение считается зависшим после 60s
const PEL_CLAIM_COUNT = 50;           // за одну итерацию reclaim не более 50
const MAX_DELIVERY_COUNT = 3;         // после 3 попыток — dead-letter (XACK + log)
const PEL_RECLAIM_INTERVAL_MS = 60_000;

interface StreamMessage {
  type: string;
  data: unknown;
}

export class ValkeyStreams {
  private subscriber: Valkey;
  private isRunning = true;
  private logger: Logger;
  private reclaimTimer: ReturnType<typeof setInterval> | null = null;
  // FIX #1: guard против двойного запуска pollLoop при reconnect Valkey
  private isPolling = false;

  constructor(
    valkeyOpts: { host: string; port: number; retryStrategy?: (times: number) => number },
    private readonly connectionManager: ConnectionManager,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'ValkeyStreams' });
    this.subscriber = new Valkey(valkeyOpts);

    this.subscriber.on('error', (err: Error) => {
      this.logger.error({ err }, 'ValkeyStreams subscriber error');
    });

    this.subscriber.on('ready', async () => {
      this.logger.info('Valkey subscriber ready, setting up consumer groups');
      try {
        // FIX #2: при reconnect очищаем старый reclaimTimer чтобы не было утечки
        if (this.reclaimTimer) {
          clearInterval(this.reclaimTimer);
          this.reclaimTimer = null;
        }

        await this.initializeConsumerGroups();
        await this.processPendingMessages();

        if (this.isRunning) {
          this.startReclaimTimer();
          // FIX #1: запускаем pollLoop только если он уже не запущен
          if (!this.isPolling) {
            this.isPolling = true;
            this.pollLoop().finally(() => {
              this.isPolling = false;
            });
          } else {
            this.logger.warn('pollLoop already running, skipping duplicate start after reconnect');
          }
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

  private async processPendingMessages(): Promise<void> {
    try {
      const ids = STREAM_KEYS.map(() => '0');
      const results = await this.subscriber.xreadgroup(
        'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
        'COUNT', COUNT,
        'STREAMS',
        ...STREAM_KEYS,
        ...ids
      );
      if (results) await this.handleStreamResults(results);
    } catch (err) {
      this.logger.error({ err }, 'Failed to read pending messages');
    }
  }

  // FIX: запускаем таймер reclaim PEL
  private startReclaimTimer(): void {
    this.reclaimTimer = setInterval(() => {
      this.reclaimStalePending().catch((err) => {
        this.logger.error({ err }, 'reclaimStalePending error');
      });
    }, PEL_RECLAIM_INTERVAL_MS);
  }

  /**
   * FIX #3: XPENDING батчем вместо N+1 запросов.
   * Один XPENDING на весь stream за итерацию reclaimStalePending.
   * Строим Map<msgId, deliveryCount> из результата и проверяем по нему.
   */
  private async reclaimStalePending(): Promise<void> {
    for (const stream of STREAM_KEYS) {
      try {
        // XAUTOCLAIM: iovalkey возвращает [nextStartId, [[id, fields], ...]]
        const result = await (this.subscriber as unknown as {
          xautoclaim(stream: string, group: string, consumer: string,
            minIdleTime: number, start: string,
            countKeyword: string, count: number): Promise<[string, Array<[string, string[]]>]>
        }).xautoclaim(
          stream, CONSUMER_GROUP, CONSUMER_NAME,
          PEL_CLAIM_IDLE_MS, '0-0',
          'COUNT', PEL_CLAIM_COUNT
        );

        if (!result || !Array.isArray(result[1]) || result[1].length === 0) continue;

        const messages = result[1];

        // FIX #3: один XPENDING на весь batch вместо N отдельных запросов
        const pendingList = await this.subscriber.xpending(
          stream, CONSUMER_GROUP, '-', '+', messages.length
        ) as Array<[string, string, number, number]>;

        const deliveryMap = new Map<string, number>(
          pendingList.map((p) => [p[0], p[3]])
        );

        const deadLetterIds: string[] = [];
        const retryMessages: Array<[string, string[]]> = [];

        for (const [msgId, fields] of messages) {
          const deliveryCount = deliveryMap.get(msgId) ?? 0;
          if (deliveryCount > MAX_DELIVERY_COUNT) {
            this.logger.warn(
              { stream, msgId, deliveryCount },
              'Dead-letter: message exceeded max delivery count, discarding'
            );
            deadLetterIds.push(msgId);
          } else {
            retryMessages.push([msgId, fields]);
          }
        }

        // XACK dead-letter сразу без обработки
        if (deadLetterIds.length > 0) {
          await this.subscriber.xack(stream, CONSUMER_GROUP, ...deadLetterIds);
        }

        // Повторно обрабатываем остальные
        if (retryMessages.length > 0) {
          await this.handleStreamResults([[stream, retryMessages]]);
        }
      } catch (err) {
        this.logger.error({ stream, err }, 'Error in reclaimStalePending for stream');
      }
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const ids = STREAM_KEYS.map(() => '>');
        const results = await this.subscriber.xreadgroup(
          'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
          'COUNT', COUNT,
          'BLOCK', BLOCK_MS,
          'STREAMS',
          ...STREAM_KEYS,
          ...ids
        );
        if (results) await this.handleStreamResults(results);
      } catch (err: unknown) {
        const e = err as Error;
        if (e.message?.includes('NORECONNECT') || e.message?.includes('Connection is closed')) {
          this.logger.warn('Valkey connection lost during poll, waiting for reconnect');
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
        } catch {
          this.logger.warn({ streamKey, msgId }, 'Failed to parse message, XACKing anyway');
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
              if (latencyMs >= 0) wsMessageLatencyHistogram.observe({ channel: wsChannel }, latencyMs);
            }
          }
          this.connectionManager.updatePing(client.id);
        }
        msgIds.push(msgId);
      }

      if (msgIds.length > 0) {
        await this.subscriber.xack(streamKey, CONSUMER_GROUP, ...msgIds);
      }
    }
  }

  async close(): Promise<void> {
    this.isRunning = false;
    // FIX: очищаем таймер reclaim при shutdown
    if (this.reclaimTimer) {
      clearInterval(this.reclaimTimer);
      this.reclaimTimer = null;
    }
    try {
      await this.subscriber.quit();
      this.logger.info('ValkeyStreams subscriber closed');
    } catch (err) {
      this.logger.error({ err }, 'Error closing ValkeyStreams subscriber');
    }
  }
}
