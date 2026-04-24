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

// FIX #11: подписки восстанавливаются при каждом reconnect через событие 'ready'
// без этого после обрыва TCP Valkey молча перестаёт доставлять сообщения
function setupSubscriptions(): void {
  sub.subscribe('raw:trades', 'raw:ticker', 'raw:candle', (e: unknown) => {
    if (e) log.error(e, 'subscribe error');
  });
}

sub.on('ready', () => {
  log.info('sub reconnected — resubscribing to raw:* channels');
  setupSubscriptions();
});

sub.on('message', (channel: string, msg: string) => {
  try {
    const data = JSON.parse(msg);
    if (channel === 'raw:trades') {
      const t = normalizeTrade(data, data.exchange as ExchangeId);
      if (t) pub.publish('norm:trades', JSON.stringify(t));
    } else if (channel === 'raw:ticker') {
      const t = normalizeTicker(data, data.exchange as ExchangeId);
      if (t) pub.publish('norm:ticker', JSON.stringify(t));
    } else if (channel === 'raw:candle') {
      const c = normalizeCandle(data.c, data.symbol, data.tf as Timeframe, data.exchange as ExchangeId);
      if (c) pub.publish('norm:candle', JSON.stringify(c));
    }
  } catch (e) { log.error(e, 'normalize error'); }
});

setInterval(() => hb.set('heartbeat:normalizer-core', Date.now().toString(), 'EX', 30), 5_000);

process.on('SIGTERM', () => { sub.quit(); pub.quit(); hb.quit(); process.exit(0); });
process.on('SIGINT',  () => { sub.quit(); pub.quit(); hb.quit(); process.exit(0); });

log.info('normalizer-core started');
