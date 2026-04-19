import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import { ETFFetcher } from './etf-fetcher.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('etf-core');

const VALKEY_OPTS = {
  host: env.VALKEY_HOST,
  port: env.VALKEY_PORT,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  keepAlive: 10000,
  enableOfflineQueue: true,
};

const pub = new Valkey(VALKEY_OPTS);
const hb  = new Valkey(VALKEY_OPTS);

pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const fetcher = new ETFFetcher();

async function fetchAndPublish(): Promise<void> {
  const flows = await fetcher.fetch();
  if (flows.length > 0) {
    await pub.set('etf:flows:latest', JSON.stringify(flows), 'EX', 3600);
    await pub.publish('etf:update', JSON.stringify(flows));
    log.info({ count: flows.length }, 'etf flows published');
  }
}

fetchAndPublish();
setInterval(fetchAndPublish, 60 * 60 * 1000);
setInterval(() => hb.set('heartbeat:etf-core', Date.now().toString(), 'EX', 30), 5_000);

process.on('SIGTERM', () => { pub.quit(); hb.quit(); process.exit(0); });
log.info('etf-core started');
