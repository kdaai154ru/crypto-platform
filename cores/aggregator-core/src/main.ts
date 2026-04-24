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

// FIX #2: используем отдельный Stream-клиент
// ws-gateway читает данные через XREADGROUP из Streams (agg:ticker, agg:candle)
// pub.publish() пишет в Pub/Sub — ws-gateway его НЕ читает
// storage-core читает через sub.on('message') из Pub/Sub — для него оставляем publish
const sub = new Valkey(VALKEY_OPTS);
const pub = new Valkey(VALKEY_OPTS); // Pub/Sub для storage-core
const str = new Valkey(VALKEY_OPTS); // Streams для ws-gateway
const hb  = new Valkey(VALKEY_OPTS);

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
str.on('error', (e: Error) => log.warn({ err: e.message }, 'str connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const STREAM_MAXLEN = 1000;
const agg      = new OHLCVAggregator();
const snap     = new PairSnapshotStore();
const throttle = new ThrottleManager();

sub.subscribe('norm:candle', 'norm:ticker', (e: unknown) => {
  if (e) log.error(e);
});

sub.on('message', (ch: string, msg: string) => {
  try {
    const data = JSON.parse(msg);
    if (ch === 'norm:candle') {
      const c = agg.process(data as NormalizedCandle);
      snap.setCandle(c);
      const json = JSON.stringify(c);
      // Pub/Sub → storage-core
      pub.publish('agg:candle', json);
      // FIX #2: Stream → ws-gateway (XREADGROUP читает только Streams)
      str.xadd('agg:candle', 'MAXLEN', '~', String(STREAM_MAXLEN), '*', 'data', json)
        .catch((e: Error) => log.warn({ err: e.message }, 'xadd agg:candle failed'));
    } else if (ch === 'norm:ticker') {
      const t = data as NormalizedTicker;
      snap.setTicker(t);
      if (throttle.shouldSend(`ticker:${t.symbol}`, 400)) {
        // Pub/Sub → storage-core
        pub.publish('agg:ticker', msg);
        // FIX #2: Stream → ws-gateway
        str.xadd('agg:ticker', 'MAXLEN', '~', String(STREAM_MAXLEN), '*', 'data', msg)
          .catch((e: Error) => log.warn({ err: e.message }, 'xadd agg:ticker failed'));
      }
    }
  } catch (e: unknown) {
    log.error(e);
  }
});

setInterval(
  () => hb.set('heartbeat:aggregator-core', Date.now().toString(), 'EX', 30),
  5_000,
);

process.on('SIGTERM', () => {
  sub.quit();
  pub.quit();
  str.quit();
  hb.quit();
  process.exit(0);
});
process.on('SIGINT', () => {
  sub.quit();
  pub.quit();
  str.quit();
  hb.quit();
  process.exit(0);
});

log.info('aggregator-core started');
