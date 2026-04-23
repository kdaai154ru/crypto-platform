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
const hb = new Valkey(VALKEY_OPTS);

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error', (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const chWriter = new ClickHouseTradesWriter(
  log,
  env.CLICKHOUSE_HOST,
  env.CLICKHOUSE_PORT,
  env.CLICKHOUSE_DB
);
const processor = new TradeProcessor(
  log,
  (batch) => chWriter.writeBatch(batch),
  (delta) => pub.publish('trades:delta', JSON.stringify(delta))
);

let metricsServer: MetricsServer | null = null;

async function start() {
  // Запуск метрик-сервера
  metricsServer = await createMetricsServer(env.METRICS_PORT);
  log.info({ port: env.METRICS_PORT }, 'Metrics server started');

  sub.subscribe('norm:trades', (e: unknown) => {
    if (e) log.error(e);
  });

  sub.on('message', (_ch: string, msg: string) => {
    try {
      const trade = JSON.parse(msg) as NormalizedTrade;
      
      // Инкремент обработанных сообщений
      messagesProcessedCounter.inc({ core: 'trades-core', channel: 'norm:trades' });
      
      // Расчёт задержки относительно биржевого времени (trade.ts)
      if (trade.ts) {
        const lag = Date.now() - trade.ts;
        pipelineLagGauge.set({ core: 'trades-core' }, lag);
      }
      
      processor.process(trade);
      pub.publish('trades:stream', msg);
      if (trade.isLarge) {
        pub.publish('trades:large', msg);
      }
    } catch (e) {
      log.error(e);
      messagesFailedCounter.inc({
        core: 'trades-core',
        channel: 'norm:trades',
        reason: 'parse_error',
      });
    }
  });

    setInterval(async () => {
      try {
        await hb.set('heartbeat:trades-core', Date.now().toString(), 'EX', 30);
      } catch (err) {
        log.warn({ err }, 'heartbeat failed');
      }
    }, 5_000);
  const shutdown = async () => {
    log.info('Shutting down trades-core...');
    processor.destroy();
    sub.quit();
    pub.quit();
    hb.quit();
    if (metricsServer) {
      await metricsServer.close();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log.info('trades-core started');
}

start().catch((e) => {
  log.fatal(e);
  process.exit(1);
});