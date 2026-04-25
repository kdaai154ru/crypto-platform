// cores/screener-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import type { NormalizedCandle } from '@crypto-platform/types';
import { ScreenerEngine } from './screener-engine.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('screener-core');

const sub    = createValkeyClient();
const pub    = createValkeyClient();
const hb     = createValkeyClient();
const reader = createValkeyClient();

sub.on('error',    (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error',    (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',     (e: Error) => log.warn({ err: e.message }, 'hb connection error'));
reader.on('error', (e: Error) => log.warn({ err: e.message }, 'reader connection error'));

const SCREENER_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const engine = new ScreenerEngine({ tfs: SCREENER_TIMEFRAMES, maxPairs: 1000 });

async function warmUpFromValkey(): Promise<void> {
  try {
    const buckets = new Map<string, NormalizedCandle[]>();

    let cursor = '0';
    let scanned = 0;
    do {
      const [nextCursor, keys] = await reader.scan(cursor, 'MATCH', 'candle:*:*:*', 'COUNT', 200);
      cursor = nextCursor;
      scanned += keys.length;

      const pipeline = reader.pipeline();
      for (const key of keys) pipeline.get(key);
      const results = await pipeline.exec();
      if (!results) continue;

      for (let i = 0; i < keys.length; i++) {
        const res = results[i];
        if (!res || res[0]) continue;
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
            if (!bucket) { bucket = []; buckets.set(bucketKey, bucket); }
            bucket.push(candle);
          }
        } catch { /* skip malformed */ }
      }
    } while (cursor !== '0');

    let warmedUp = 0;
    for (const [bucketKey, candles] of buckets) {
      const [symbol, tf] = bucketKey.split(':') as [string, string];
      candles.sort((a, b) => a.ts - b.ts);
      engine.warmUp(symbol, tf, candles);
      warmedUp++;
    }

    log.info({ scanned, buckets: buckets.size, warmedUp }, 'screener warm-up from Valkey complete');
  } catch (e) {
    log.warn({ err: e }, 'screener warm-up failed, starting cold');
  }
}

let publishErrors = 0;
const MAX_PUBLISH_ERRORS = 5;
let publishDisabled = false;

function setupSubscriptions(): void {
  sub.subscribe('agg:candle', (e: unknown) => {
    if (e) log.error(e, 'subscribe error');
  });
}

sub.on('ready', () => {
  log.info('sub reconnected — resubscribing to agg:candle');
  setupSubscriptions();
});

sub.on('message', (_: string, msg: string) => {
  try {
    const c = JSON.parse(msg) as NormalizedCandle;
    if (!SCREENER_TIMEFRAMES.includes(c.tf)) return;
    engine.update(c);
  } catch (e: unknown) { log.error(e); }
});

let isPublishing = false;

const publishInterval = setInterval(async () => {
  if (publishDisabled || isPublishing) return;
  isPublishing = true;
  try {
    const rows = engine.getRows('rsi');
    if (!rows.length) return;
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
  } finally {
    isPublishing = false;
  }
}, 30_000);

const hbInterval = setInterval(
  () => hb.set('heartbeat:screener-core', Date.now().toString(), 'EX', 30),
  5_000,
);

const shutdown = async () => {
  clearInterval(publishInterval);
  clearInterval(hbInterval);
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
