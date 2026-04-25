import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import type { NormalizedCandle } from '@crypto-platform/types';
import { rsi } from './rsi.js';
import { macd } from './macd.js';
import { bollinger } from './bollinger.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('indicator-core');

const sub = createValkeyClient();
const pub = createValkeyClient();
const hb  = createValkeyClient();

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const closesStore = new Map<string, { arr: number[]; lastSeen: number }>();

const PRUNE_INTERVAL_MS  = 10 * 60 * 1000;
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

const pruneTimer = setInterval(() => {
  const now = Date.now();
  let pruned = 0;
  for (const [key, entry] of closesStore) {
    if (now - entry.lastSeen > STALE_THRESHOLD_MS) { closesStore.delete(key); pruned++; }
  }
  if (pruned > 0) log.info({ pruned }, 'closesStore: pruned stale entries');
}, PRUNE_INTERVAL_MS);

function setupSubscriptions(): void {
  sub.subscribe('agg:candle', (e: unknown) => { if (e) log.error(e, 'subscribe error'); });
}

sub.on('ready', () => {
  log.info('sub reconnected — resubscribing to agg:candle');
  setupSubscriptions();
});

sub.on('message', (_: string, msg: string) => {
  try {
    const c = JSON.parse(msg) as NormalizedCandle;
    if (!c.isClosed) return;

    const key = `${c.symbol}:${c.tf}`;
    let entry = closesStore.get(key);
    if (!entry) { entry = { arr: [], lastSeen: Date.now() }; closesStore.set(key, entry); }
    entry.lastSeen = Date.now();
    entry.arr.push(c.close);
    if (entry.arr.length > 200) entry.arr.shift();

    const arr = entry.arr;
    const rsiVal  = rsi(arr);
    const macdVal = macd(arr);
    const bbVal   = bollinger(arr);

    if (rsiVal != null) {
      pub.publish(`indicator:${c.symbol}:${c.tf}:rsi`, JSON.stringify({ value: rsiVal, ts: c.ts }))
        .catch((e: Error) => log.error({ err: e.message }, 'publish rsi failed'));
    }
    if (macdVal != null) {
      pub.publish(`indicator:${c.symbol}:${c.tf}:macd`, JSON.stringify({ ...macdVal, ts: c.ts }))
        .catch((e: Error) => log.error({ err: e.message }, 'publish macd failed'));
    }
    if (bbVal != null) {
      pub.publish(`indicator:${c.symbol}:${c.tf}:bb`, JSON.stringify({ ...bbVal, ts: c.ts }))
        .catch((e: Error) => log.error({ err: e.message }, 'publish bb failed'));
    }
  } catch (e: unknown) { log.error(e); }
});

const hbTimer = setInterval(
  () => hb.set('heartbeat:indicator-core', Date.now().toString(), 'EX', 30),
  5_000,
);

const shutdown = () => {
  clearInterval(hbTimer);
  clearInterval(pruneTimer);
  sub.quit();
  pub.quit();
  hb.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

log.info('indicator-core started');
