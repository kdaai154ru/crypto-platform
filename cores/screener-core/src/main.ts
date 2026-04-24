// cores/screener-core/src/main.ts
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

const sub    = new Valkey(VALKEY_OPTS);
const pub    = new Valkey(VALKEY_OPTS);
const hb     = new Valkey(VALKEY_OPTS);
const reader = new Valkey(VALKEY_OPTS);

sub.on('error',    (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error',    (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',     (e: Error) => log.warn({ err: e.message }, 'hb connection error'));
reader.on('error', (e: Error) => log.warn({ err: e.message }, 'reader connection error'));

const SCREENER_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const engine = new ScreenerEngine({ tfs: SCREENER_TIMEFRAMES, maxPairs: 1000 });

async function warmUpFromValkey(): Promise<void> {
  try {
    // FIX: accumulate ALL candles per symbol:tf first, THEN call warmUp()
    // Previous code called warmUp(symbol, tf, [singleCandle]) in the SCAN loop,
    // replacing the array with 1 element each iteration — RSI never had enough history.
    const buckets = new Map<string, NormalizedCandle[]>();

    let cursor = '0';
    let scanned = 0;
    do {
      const [nextCursor, keys] = await reader.scan(cursor, 'MATCH', 'candle:*:*:*', 'COUNT', 200);
      cursor = nextCursor;
      scanned += keys.length;

      // Pipeline GET requests for this batch
      const pipeline = reader.pipeline();
      for (const key of keys) pipeline.get(key);
      const results = await pipeline.exec();
      if (!results) continue;

      for (let i = 0; i < keys.length; i++) {
        const res = results[i];
        if (!res || res[0]) continue; // res[0] is error
        const raw = res[1] as string | null;
        if (!raw) continue;
        try {
          const candle = JSON.parse(raw) as NormalizedCandle;
          if (
            typeof candle.symbol === 'string' &&
            typeof candle.tf === 'string' &&
            SCREENER_TIMEFRAMES.includes(candle.tf)
          ) {
            const bucketKey = `${candle.symbol}:${candle.tf}`;
            let bucket = buckets.get(bucketKey);
            if (!bucket) {
              bucket = [];
              buckets.set(bucketKey, bucket);
            }
            bucket.push(candle);
          }
        } catch { /* skip malformed */ }
      }
    } while (cursor !== '0');

    // Now call warmUp() once per symbol:tf with full sorted history
    let warmedUp = 0;
    for (const [bucketKey, candles] of buckets) {
      const [symbol, tf] = bucketKey.split(':') as [string, string];
      // Sort ascending by open time so RSI calculation is deterministic
      candles.sort((a, b) => a.ts - b.ts);
      engine.warmUp(symbol, tf, candles);
      warmedUp++;
    }

    log.info(
      { scanned, buckets: buckets.size, warmedUp: warmedUp },
      'screener warm-up from Valkey complete'
    );
  } catch (e) {
    log.warn(
      { err: e },
      'screener warm-up failed, starting cold — RSI needs 15+ candles to accumulate'
    );
  }
}

let publishErrors = 0;
const MAX_PUBLISH_ERRORS = 5;
let publishDisabled = false;

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

setInterval(async () => {
  if (publishDisabled) {
    log.warn('screener publish disabled due to repeated errors, skipping');
    return;
  }

  const rows = engine.getRows('rsi');
  if (!rows.length) return;

  try {
    await pub.publish('screener:update', JSON.stringify(rows));
    if (publishErrors > 0) {
      publishErrors = 0;
      publishDisabled = false;
      log.info('screener publish recovered');
    }
    log.debug({ rows: rows.length, ...engine.stats() }, 'screener refresh');
  } catch (e: unknown) {
    publishErrors++;
    log.error({ err: e, attempt: publishErrors }, 'screener publish failed');
    if (publishErrors >= MAX_PUBLISH_ERRORS) {
      publishDisabled = true;
      log.error('screener publish circuit breaker OPEN — pausing 60s');
      setTimeout(() => {
        publishDisabled = false;
        publishErrors = 0;
        log.info('screener publish circuit breaker CLOSED — retrying');
      }, 60_000);
    }
  }
}, 30_000);

setInterval(
  () => hb.set('heartbeat:screener-core', Date.now().toString(), 'EX', 30),
  5_000,
);

const shutdown = async () => {
  await sub.quit();
  await pub.quit();
  await hb.quit();
  await reader.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

warmUpFromValkey().then(() => {
  log.info('screener-core started');
}).catch((e) => {
  log.fatal(e);
  process.exit(1);
});
