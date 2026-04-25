import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import type { ExchangeId, Timeframe } from '@crypto-platform/types';
import { createValkeyClient } from '@crypto-platform/utils';
import { normalizeTrade, normalizeTicker, normalizeCandle } from './normalize.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('normalizer-core');

const sub = createValkeyClient();
const pub = createValkeyClient();
const hb  = createValkeyClient();

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

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
      if (t) pub.publish('norm:trades', JSON.stringify(t))
        .catch((e: Error) => log.error({ err: e.message }, 'publish norm:trades failed'));
    } else if (channel === 'raw:ticker') {
      const t = normalizeTicker(data, data.exchange as ExchangeId);
      if (t) pub.publish('norm:ticker', JSON.stringify(t))
        .catch((e: Error) => log.error({ err: e.message }, 'publish norm:ticker failed'));
    } else if (channel === 'raw:candle') {
      const c = normalizeCandle(data.c, data.symbol, data.tf as Timeframe, data.exchange as ExchangeId);
      if (c) pub.publish('norm:candle', JSON.stringify(c))
        .catch((e: Error) => log.error({ err: e.message }, 'publish norm:candle failed'));
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
