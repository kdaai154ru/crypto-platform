// cores/subscription-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import { SubscriptionManager } from './subscription-manager.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('subscription-core');

const sub = createValkeyClient();
const pub = createValkeyClient();
const hb  = createValkeyClient();

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const manager = new SubscriptionManager(log, 60_000);
manager.on('start_stream', (sym: string, ch: string[]) => pub.publish('stream:start', JSON.stringify({ symbol: sym, channels: ch })));
manager.on('stop_stream',  (sym: string)               => pub.publish('stream:stop',  JSON.stringify({ symbol: sym })));

let isReplaying = false;
const REPLAY_DEBOUNCE_MS = 5_000;

function replayToExchange(): void {
  if (isReplaying) {
    log.warn('exchange:ready duplicate within debounce window, skipping replay');
    return;
  }
  const active = manager.getActivePairs();
  if (active.length === 0) {
    log.info('exchange:ready received, no active pairs to replay');
    return;
  }
  isReplaying = true;
  setTimeout(() => { isReplaying = false; }, REPLAY_DEBOUNCE_MS);
  log.info({ count: active.length }, 'exchange:ready — sending stream:replay');
  pub.publish('stream:replay', JSON.stringify({ pairs: active }));
}

sub.subscribe('sub:request', 'sub:release', 'exchange:ready', (e: unknown) => { if (e) log.error(e); });

sub.on('message', (ch: string, msg: string) => {
  try {
    if (ch === 'sub:request') {
      const { viewerId, symbol, channels } = JSON.parse(msg) as { viewerId: string; symbol: string; channels?: string[] };
      manager.subscribe(viewerId, symbol, Array.isArray(channels) ? channels : []);
    } else if (ch === 'sub:release') {
      const { viewerId, symbol } = JSON.parse(msg) as { viewerId: string; symbol: string };
      manager.unsubscribe(viewerId, symbol);
    } else if (ch === 'exchange:ready') {
      replayToExchange();
    }
  } catch (e) { log.error(e); }
});

const hbInterval = setInterval(() => {
  hb.set('heartbeat:subscription-core', Date.now().toString(), 'EX', 30);
  hb.set('stat:active_pairs', manager.getActivePairCount().toString(), 'EX', 30);
}, 5_000);

const shutdown = () => {
  clearInterval(hbInterval);
  manager.destroy();
  sub.quit();
  pub.quit();
  hb.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

log.info('subscription-core started');
