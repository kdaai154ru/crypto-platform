import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { NormalizedCandle } from '@crypto-platform/types';
import { rsi } from './rsi.js';
import { macd } from './macd.js';
import { bollinger } from './bollinger.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('indicator-core');

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

const closesStore = new Map<string, number[]>();

sub.subscribe('agg:candle', (e: unknown) => {
  if (e) log.error(e);
});

sub.on('message', (_: string, msg: string) => {
  try {
    const c = JSON.parse(msg) as NormalizedCandle;
    if (!c.isClosed) return;

    const key = `${c.symbol}:${c.tf}`;
    const arr = closesStore.get(key) ?? [];
    arr.push(c.close);
    if (arr.length > 200) arr.shift();
    closesStore.set(key, arr);

    const rsiVal  = rsi(arr);
    const macdVal = macd(arr);
    const bbVal   = bollinger(arr);

    if (rsiVal != null) {
      pub.publish(`indicator:${c.symbol}:${c.tf}:rsi`, JSON.stringify({ value: rsiVal, ts: c.ts }));
    }
    if (macdVal != null) {
      pub.publish(`indicator:${c.symbol}:${c.tf}:macd`, JSON.stringify({ ...macdVal, ts: c.ts }));
    }
    if (bbVal != null) {
      pub.publish(`indicator:${c.symbol}:${c.tf}:bb`, JSON.stringify({ ...bbVal, ts: c.ts }));
    }
  } catch (e: unknown) {
    log.error(e);
  }
});

setInterval(
  () => hb.set('heartbeat:indicator-core', Date.now().toString(), 'EX', 30),
  5_000,
);

process.on('SIGTERM', () => { sub.quit(); pub.quit(); hb.quit(); process.exit(0); });
log.info('indicator-core started');
