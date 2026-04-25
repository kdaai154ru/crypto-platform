// cores/aggregator-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { NormalizedCandle, NormalizedTicker } from '@crypto-platform/types';
import { OHLCVAggregator } from './ohlcv-aggregator.js';
import { PairSnapshotStore } from './pair-snapshot.js';
import { ThrottleManager } from './throttle-manager.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('aggregator-core');

const VALKEY_OPTS = {
  host: env.VALKEY_HOST,
  port: env.VALKEY_PORT,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  keepAlive: 10000,
  enableOfflineQueue: true,
};

// sub — Pub/Sub от normalizer-core
// pub — Pub/Sub для storage-core
// str — Streams для ws-gateway (XREADGROUP)
// hb  — heartbeat
const sub = new Valkey(VALKEY_OPTS);
const pub = new Valkey(VALKEY_OPTS);
const str = new Valkey(VALKEY_OPTS);
const hb  = new Valkey(VALKEY_OPTS);

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
str.on('error', (e: Error) => log.warn({ err: e.message }, 'str connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

// FIX #16: STREAM_MAXLEN увеличен с 1000 до 10000
// При 1000 быстрый producer (binance ticker ~100msg/s) заполнял стрим за 10 секунд
// и ws-gateway не успевал прочитать pending messages при reconnect.
// ~ (tilde) = приблизительный MAXLEN — Redis удаляет только целые radix-tree ноды,
// что значительно эффективнее по CPU чем точный MAXLEN.
const STREAM_MAXLEN = 10_000;
const agg      = new OHLCVAggregator();
const snap     = new PairSnapshotStore();
const throttle = new ThrottleManager();

// FIX #13: сохраняем ref таймера для clearInterval при shutdown
let hbTimer: ReturnType<typeof setInterval> | null = null;

// FIX #6: resubscribe на norm:candle / norm:ticker при каждом reconnect.
// iovalkey НЕ восстанавливает pub/sub подписки автоматически после обрыва TCP.
// Без этого aggregator-core молча перестаёт получать данные после reconnect.
function setupSubscriptions(): void {
  sub.subscribe('norm:candle', 'norm:ticker', (e: unknown) => {
    if (e) log.error(e, 'subscribe error');
  });
}

sub.on('ready', () => {
  log.info('sub reconnected — resubscribing to norm:candle / norm:ticker');
  setupSubscriptions();
});

sub.on('message', (ch: string, msg: string) => {
  try {
    const data = JSON.parse(msg);
    if (ch === 'norm:candle') {
      const c = agg.process(data as NormalizedCandle);
      snap.setCandle(c);
      const json = JSON.stringify(c);
      // Pub/Sub → storage-core
      // FIX #8: .catch() prevents UnhandledPromiseRejection → process crash on pub reconnect
      pub.publish('agg:candle', json)
        .catch((e: Error) => log.warn({ err: e.message }, 'publish agg:candle failed'));
      // Stream → ws-gateway
      str.xadd('agg:candle', 'MAXLEN', '~', String(STREAM_MAXLEN), '*', 'data', json)
        .catch((e: Error) => log.warn({ err: e.message }, 'xadd agg:candle failed'));
    } else if (ch === 'norm:ticker') {
      const t = data as NormalizedTicker;
      snap.setTicker(t);
      if (throttle.shouldSend(`ticker:${t.symbol}`, 400)) {
        // Pub/Sub → storage-core
        pub.publish('agg:ticker', msg)
          .catch((e: Error) => log.warn({ err: e.message }, 'publish agg:ticker failed'));
        // Stream → ws-gateway
        str.xadd('agg:ticker', 'MAXLEN', '~', String(STREAM_MAXLEN), '*', 'data', msg)
          .catch((e: Error) => log.warn({ err: e.message }, 'xadd agg:ticker failed'));
      }
    }
  } catch (e: unknown) {
    log.error(e);
  }
});

const shutdown = () => {
  log.info('Shutting down aggregator-core...');
  if (hbTimer) clearInterval(hbTimer);
  sub.quit();
  pub.quit();
  str.quit();
  hb.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

hbTimer = setInterval(
  () => hb.set('heartbeat:aggregator-core', Date.now().toString(), 'EX', 30),
  5_000,
);

log.info('aggregator-core started');
