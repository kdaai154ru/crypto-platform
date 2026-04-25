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
  retryStrategy: (times: number) => Math.min(times * 100, 3_000),
  keepAlive: 10_000,
  enableOfflineQueue: true,
};

const sub = new Valkey(VALKEY_OPTS);
const pub = new Valkey(VALKEY_OPTS);
const hb  = new Valkey(VALKEY_OPTS);

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

// FIX(audit): resubscribe after Valkey reconnect.
// iovalkey does NOT auto-restore pub/sub on reconnect — explicit re-subscribe required.
// FIX: callback type must be (err: Error | null | undefined) to match iovalkey Callback<unknown>
sub.on('ready', () => {
  log.info('Valkey sub ready, subscribing to norm:* channels');
  sub.subscribe('norm:trades', 'norm:ticker', 'norm:candle', (err: Error | null | undefined) => {
    if (err) log.error({ err }, 'Failed to subscribe to norm:* channels');
  });
});

// FIX: use CH_HOST / CH_PORT / CH_DATABASE — the actual field names in CHSchema
const chWriter = new ClickHouseTradesWriter(
  log,
  env.CH_HOST,
  env.CH_PORT,
  env.CH_DATABASE
);

const processor = new TradeProcessor(
  log,
  async (batch) => {
    try {
      await chWriter.writeBatch(batch);
      // FIX: label key must be 'core', not 'service' (matches createCounter declaration)
      messagesProcessedCounter.inc({ core: 'trades-core', channel: 'norm:trades' }, batch.length);
    } catch (e) {
      messagesFailedCounter.inc({ core: 'trades-core', channel: 'norm:trades', reason: 'ch_write' }, batch.length);
      log.error({ err: e, count: batch.length }, 'ClickHouse write failed');
      throw e; // re-throw so TradeProcessor re-buffers
    }
  },
  (delta) => {
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
    // FIX: label key must be 'core', not 'stage' (matches createGauge declaration)
    pipelineLagGauge.set({ core: 'trades-core' }, lag);
  } catch (e) {
    log.error({ err: e, message }, 'Failed to process trade message');
    messagesFailedCounter.inc({ core: 'trades-core', channel: 'norm:trades', reason: 'parse' });
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
  await processor.flush();
  processor.destroy();
  await Promise.allSettled([sub.quit(), pub.quit(), hb.quit()]);
  if (metricsServer) await metricsServer.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

start().catch((e) => {
  log.fatal(e);
  process.exit(1);
});
