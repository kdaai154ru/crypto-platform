// cores/trades-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema, CHSchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { NormalizedTrade } from '@crypto-platform/types';
import { TradeProcessor } from './trade-processor.js';
import { ClickHouseTradesWriter } from './clickhouse-writer.js';
import {
  createMetricsServer,
  messagesProcessedCounter,
  messagesFailedCounter,
  pipelineLagGauge,
  type MetricsServer,
} from '@crypto-platform/metrics';
import { z } from 'zod';

const env = loadEnv(
  BaseSchema.merge(ValkeySchema)
    .merge(CHSchema)
    .merge(z.object({ METRICS_PORT: z.coerce.number().default(4005) }))
);
const log = createLogger('trades-core');

const VALKEY_OPTS = {
  host: env.VALKEY_HOST,
  port: env.VALKEY_PORT,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  keepAlive: 10000,
  enableOfflineQueue: true,
};

const sub = new Valkey(VALKEY_OPTS);
const pub = new Valkey(VALKEY_OPTS);
const hb  = new Valkey(VALKEY_OPTS);

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

// FIX(audit): resubscribe после reconnect Valkey.
// iovalkey при reconnect переходит в состояние 'ready' заново,
// но pub/sub подписки НЕ восстанавливаются автоматически — нужен явный re-subscribe.
sub.on('ready', () => {
  log.info('Valkey sub ready, subscribing to norm:* channels');
  sub.subscribe('norm:trades', 'norm:ticker', 'norm:candle', (err: Error | null) => {
    if (err) log.error({ err }, 'Failed to subscribe to norm:* channels');
  });
});

const chWriter = new ClickHouseTradesWriter(
  log,
  env.CLICKHOUSE_HOST,
  env.CLICKHOUSE_PORT,
  env.CLICKHOUSE_DB
);

// FIX #4: writeBatch с catch — ошибки CH логируются и считаются в метриках
const processor = new TradeProcessor(
  log,
  async (batch) => {
    try {
      await chWriter.writeBatch(batch);
      messagesProcessedCounter.inc({ service: 'trades-core' }, batch.length);
    } catch (e) {
      messagesFailedCounter.inc({ service: 'trades-core' }, batch.length);
      log.error({ err: e, count: batch.length }, 'ClickHouse write failed');
      throw e; // re-throw so TradeProcessor re-buffers
    }
  },
  (delta) => {
    // publish CVD delta to ws-gateway via pub/sub
    pub.publish('trades:delta', JSON.stringify(delta)).catch((e: Error) =>
      log.warn({ err: e.message }, 'Failed to publish delta')
    );
  }
);

sub.on('message', (channel: string, message: string) => {
  if (channel !== 'norm:trades') return;
  try {
    const trade = JSON.parse(message) as NormalizedTrade;
    processor.process(trade);
    const lag = Date.now() - trade.ts;
    pipelineLagGauge.set({ stage: 'trades-core' }, lag);
  } catch (e) {
    log.error({ err: e, message }, 'Failed to process trade message');
    messagesFailedCounter.inc({ service: 'trades-core' });
  }
});

let hbTimer: ReturnType<typeof setInterval> | null = null;
let metricsServer: MetricsServer | null = null;

async function start(): Promise<void> {
  metricsServer = await createMetricsServer(env.METRICS_PORT);
  log.info({ port: env.METRICS_PORT }, 'Metrics server started');

  hbTimer = setInterval(
    () => hb.set('heartbeat:trades-core', Date.now().toString(), 'EX', 30),
    5_000
  );

  log.info('trades-core started');
}

async function shutdown(): Promise<void> {
  log.info('Shutting down trades-core...');
  if (hbTimer) clearInterval(hbTimer);
  // Flush remaining buffer to ClickHouse before exit
  await processor.flush();
  processor.destroy();
  await Promise.allSettled([sub.quit(), pub.quit(), hb.quit()]);
  if (metricsServer) await metricsServer.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((e) => {
  log.fatal(e);
  process.exit(1);
});
