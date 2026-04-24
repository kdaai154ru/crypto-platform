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
// FIX: отдельный клиент для warm-up (не смешивать с sub который в subscribe-режиме)
const reader = new Valkey(VALKEY_OPTS);

sub.on('error',    (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error',    (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',     (e: Error) => log.warn({ err: e.message }, 'hb connection error'));
reader.on('error', (e: Error) => log.warn({ err: e.message }, 'reader connection error'));

const SCREENER_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const engine = new ScreenerEngine({ tfs: SCREENER_TIMEFRAMES, maxPairs: 1000 });

// FIX: warm-up из Valkey при старте — читаем сохранённые свечи из storage-core
// Ключи: candle:{exchange}:{symbol}:{tf} (сохраняются storage-core)
// Это позволяет screener сразу вычислять RSI без ожидания 14+ свечей
async function warmUpFromValkey(): Promise<void> {
  try {
    // Ищем все ключи свечей через SCAN (не KEYS!)
    let cursor = '0';
    let loaded = 0;
    do {
      const [nextCursor, keys] = await reader.scan(cursor, 'MATCH', 'candle:*:*:*', 'COUNT', 200);
      cursor = nextCursor;
      for (const key of keys) {
        const raw = await reader.get(key);
        if (!raw) continue;
        try {
          const candle = JSON.parse(raw) as NormalizedCandle;
          if (candle.symbol && candle.tf && SCREENER_TIMEFRAMES.includes(candle.tf)) {
            // warm-up с одной свечой — накапливаем историю по мере поступления
            engine.warmUp(candle.symbol, candle.tf, [candle]);
            loaded++;
          }
        } catch { /* skip malformed */ }
      }
    } while (cursor !== '0');
    log.info({ loaded }, 'screener warm-up from Valkey complete');
  } catch (e) {
    log.warn({ err: e }, 'screener warm-up failed, starting cold — RSI needs 15+ candles to accumulate');
  }
}

// FIX: счётчик последовательных ошибок publish для circuit breaker
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

const shutdown = () => {
  sub.quit();
  pub.quit();
  hb.quit();
  reader.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// FIX: warm-up перед стартом основного цикла
warmUpFromValkey().then(() => {
  log.info('screener-core started');
}).catch((e) => {
  log.fatal(e);
  process.exit(1);
});
