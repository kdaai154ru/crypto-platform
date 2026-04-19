import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { NormalizedCandle } from '@crypto-platform/types';
import { ScreenerEngine } from './screener-engine.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('screener-core');

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

const SCREENER_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

const engine = new ScreenerEngine({ tfs: SCREENER_TIMEFRAMES, maxPairs: 1000 });

sub.subscribe('agg:candle', (e: unknown) => {
  if (e) log.error(e);
});

sub.on('message', (_: string, msg: string) => {
  try {
    const c = JSON.parse(msg) as NormalizedCandle;
    if (!SCREENER_TIMEFRAMES.includes(c.tf)) return;
    engine.update(c);
  } catch (e: unknown) {
    log.error(e);
  }
});

setInterval(() => {
  const rows = engine.getRows('rsi');
  if (rows.length) {
    pub.publish('screener:update', JSON.stringify(rows));
  }
  log.debug({ rows: rows.length }, 'screener refresh');
}, 30_000);

setInterval(
  () => hb.set('heartbeat:screener-core', Date.now().toString(), 'EX', 30),
  5_000,
);

process.on('SIGTERM', () => { sub.quit(); pub.quit(); hb.quit(); process.exit(0); });
log.info('screener-core started');
