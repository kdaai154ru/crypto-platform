// cores/etf-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import { ETFFetcher } from './etf-fetcher.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('etf-core');

const pub = createValkeyClient();
const hb  = createValkeyClient();

pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const fetcher = new ETFFetcher();

let consecutiveErrors = 0;
const MAX_BACKOFF_MS  = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 5_000;

async function fetchAndPublish(): Promise<void> {
  try {
    const flows = await fetcher.fetch();
    consecutiveErrors = 0;
    if (flows.length > 0) {
      await pub.set('etf:flows:latest', JSON.stringify(flows), 'EX', 3600);
      await pub.publish('etf:latest', JSON.stringify(flows));
      log.info({ count: flows.length }, 'etf flows published');
    }
  } catch (e) {
    consecutiveErrors++;
    const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, consecutiveErrors - 1), MAX_BACKOFF_MS);
    log.warn({ err: (e as Error).message, attempt: consecutiveErrors, nextRetryMs: backoff }, 'etf fetch error — backing off');
    await new Promise(r => setTimeout(r, backoff));
  }
}

(async function loop() {
  while (true) {
    await fetchAndPublish();
    if (consecutiveErrors === 0) {
      await new Promise(r => setTimeout(r, 60 * 60 * 1000));
    }
  }
})();

const hbTimer = setInterval(
  () => hb.set('heartbeat:etf-core', Date.now().toString(), 'EX', 30),
  5_000,
);

const shutdown = () => {
  clearInterval(hbTimer);
  pub.quit();
  hb.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
log.info('etf-core started');
