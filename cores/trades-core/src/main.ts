import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema, CHSchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { NormalizedTrade } from '@crypto-platform/types';
import { TradeProcessor } from './trade-processor.js';
import { ClickHouseTradesWriter } from './clickhouse-writer.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema).merge(CHSchema));
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

const chWriter  = new ClickHouseTradesWriter(log, env.CLICKHOUSE_HOST, env.CLICKHOUSE_PORT, env.CLICKHOUSE_DB);
const processor = new TradeProcessor(
  log,
  (batch) => chWriter.writeBatch(batch),
  (delta) => pub.publish('trades:delta', JSON.stringify(delta)),
);

sub.subscribe('norm:trades', (e: unknown) => { if (e) log.error(e); });

sub.on('message', (_ch: string, msg: string) => {
  try {
    const trade = JSON.parse(msg) as NormalizedTrade;
    processor.process(trade);
    if (trade.isLarge) pub.publish('trades:large', msg);
    else pub.publish('trades:stream', msg);
  } catch (e) { log.error(e); }
});

setInterval(() => hb.set('heartbeat:trades-core', Date.now().toString(), 'EX', 30), 5_000);

process.on('SIGTERM', () => { processor.destroy(); sub.quit(); pub.quit(); hb.quit(); process.exit(0); });
log.info('trades-core started');
