// cores/subscription-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import { SubscriptionManager } from './subscription-manager.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('subscription-core');

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

const manager = new SubscriptionManager(log, 60_000);
manager.on('start_stream', (sym: string, ch: string[]) => pub.publish('stream:start', JSON.stringify({ symbol: sym, channels: ch })));
manager.on('stop_stream',  (sym: string)                => pub.publish('stream:stop',  JSON.stringify({ symbol: sym })));

// FIX: guard против двойного replay при быстром exchange:ready (reconnect шторм)
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
      const { viewerId, symbol, channels } = JSON.parse(msg);
      manager.subscribe(viewerId, symbol, channels);
    } else if (ch === 'sub:release') {
      const { viewerId, symbol } = JSON.parse(msg);
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
