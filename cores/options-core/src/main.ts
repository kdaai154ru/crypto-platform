import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import { DeribitFetcher } from './deribit-fetcher.js';
import { computeOptionsAnalytics } from './analytics.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('options-core');

const pub = createValkeyClient();
const hb  = createValkeyClient();

pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const fetcher = new DeribitFetcher();

async function refresh(currency: 'BTC' | 'ETH'): Promise<void> {
  const opts = await fetcher.getInstruments(currency);
  if (!opts.length) return;
  const analytics = computeOptionsAnalytics(`${currency}/USD`, opts);
  await pub.set(`options:${currency}`, JSON.stringify(analytics), 'EX', 300);
  await pub.publish('options:update', JSON.stringify(analytics));
  log.info({ currency, pcr: analytics.pcr.toFixed(3), maxPain: analytics.maxPain }, 'options updated');
}

async function loop(): Promise<void> {
  await Promise.all([refresh('BTC'), refresh('ETH')]);
}

const hbTimer = setInterval(
  () => hb.set('heartbeat:options-core', Date.now().toString(), 'EX', 30),
  5_000,
);

const shutdown = () => {
  clearInterval(hbTimer);
  pub.quit();
  hb.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

loop();
setInterval(loop, 5 * 60 * 1000);
log.info('options-core started');
