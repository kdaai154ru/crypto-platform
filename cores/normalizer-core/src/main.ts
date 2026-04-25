// cores/normalizer-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { ExchangeId, Timeframe } from '@crypto-platform/types';
import { normalizeTrade, normalizeTicker, normalizeCandle } from './normalize.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('normalizer-core');

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

function setupSubscriptions(): void {
  sub.subscribe('raw:trades', 'raw:ticker', 'raw:candle', (e: unknown) => {
    if (e) log.error(e, 'subscribe error');
  });
}

// Resubscribe on every reconnect (Valkey drops pub/sub state on TCP disconnect)
sub.on('ready', () => {
  log.info('sub reconnected — resubscribing to raw:* channels');
  setupSubscriptions();
});

sub.on('message', (channel: string, msg: string) => {
  try {
    const data = JSON.parse(msg) as Record<string, unknown>;

    if (channel === 'raw:trades') {
      // FIX: guard exchange/symbol before cast to avoid undefined ExchangeId
      if (typeof data.exchange !== 'string' || typeof data.symbol !== 'string') {
        log.warn({ channel, keys: Object.keys(data) }, 'raw:trades missing required fields, skipping');
        return;
      }
      const t = normalizeTrade(data, data.exchange as ExchangeId);
      // FIX: .catch() prevents silent unhandled rejection when Valkey is unavailable
      if (t) pub.publish('norm:trades', JSON.stringify(t)).catch((e: Error) => log.error({ err: e.message }, 'publish norm:trades failed'));

    } else if (channel === 'raw:ticker') {
      if (typeof data.exchange !== 'string' || typeof data.symbol !== 'string') {
        log.warn({ channel, keys: Object.keys(data) }, 'raw:ticker missing required fields, skipping');
        return;
      }
      const t = normalizeTicker(data, data.exchange as ExchangeId);
      if (t) pub.publish('norm:ticker', JSON.stringify(t)).catch((e: Error) => log.error({ err: e.message }, 'publish norm:ticker failed'));

    } else if (channel === 'raw:candle') {
      if (
        typeof data.exchange !== 'string' ||
        typeof data.symbol   !== 'string' ||
        typeof data.tf       !== 'string' ||
        !Array.isArray(data.c)
      ) {
        log.warn({ channel, keys: Object.keys(data) }, 'raw:candle missing required fields, skipping');
        return;
      }
      const c = normalizeCandle(data.c, data.symbol, data.tf as Timeframe, data.exchange as ExchangeId);
      if (c) pub.publish('norm:candle', JSON.stringify(c)).catch((e: Error) => log.error({ err: e.message }, 'publish norm:candle failed'));
    }
  } catch (e) { log.error(e, 'normalize error'); }
});

const hbTimer = setInterval(
  () => hb.set('heartbeat:normalizer-core', Date.now().toString(), 'EX', 30),
  5_000,
);

const shutdown = () => {
  clearInterval(hbTimer);
  sub.quit();
  pub.quit();
  hb.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

log.info('normalizer-core started');
