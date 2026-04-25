// cores/aggregator-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import type { NormalizedCandle, NormalizedTicker } from '@crypto-platform/types';
import { OHLCVAggregator } from './ohlcv-aggregator.js';
import { PairSnapshotStore } from './pair-snapshot.js';
import { ThrottleManager } from './throttle-manager.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('aggregator-core');

const sub = createValkeyClient();
const pub = createValkeyClient();
const str = createValkeyClient();
const hb  = createValkeyClient();

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
str.on('error', (e: Error) => log.warn({ err: e.message }, 'str connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const STREAM_MAXLEN = 10_000;
const agg      = new OHLCVAggregator();
const snap     = new PairSnapshotStore();
const throttle = new ThrottleManager();

let hbTimer: ReturnType<typeof setInterval> | null = null;

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
      pub.publish('agg:candle', json)
        .catch((e: Error) => log.warn({ err: e.message }, 'publish agg:candle failed'));
      str.xadd('agg:candle', 'MAXLEN', '~', String(STREAM_MAXLEN), '*', 'data', json)
        .catch((e: Error) => log.warn({ err: e.message }, 'xadd agg:candle failed'));
    } else if (ch === 'norm:ticker') {
      const t = data as NormalizedTicker;
      snap.setTicker(t);
      if (throttle.shouldSend(`ticker:${t.symbol}`, 400)) {
        pub.publish('agg:ticker', msg)
          .catch((e: Error) => log.warn({ err: e.message }, 'publish agg:ticker failed'));
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
