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

sub.subscribe('sub:request', 'sub:release', 'module:online', (e: unknown) => { if (e) log.error(e); });

sub.on('message', (ch: string, msg: string) => {
  try {
    if (ch === 'sub:request') {
      const { viewerId, symbol, channels } = JSON.parse(msg);
      manager.subscribe(viewerId, symbol, channels);
    } else if (ch === 'sub:release') {
      const { viewerId, symbol } = JSON.parse(msg);
      manager.unsubscribe(viewerId, symbol);
    } else if (ch === 'module:online') {
      // exchange-core перезапустился — переотправляем stream:start для всех
      // активных пар чтобы он не пропустил подписки сделанные до его старта.
      const { id } = JSON.parse(msg) as { id: string };
      if (id === 'exchange-core') {
        const active = manager.getActivePairs();
        if (active.length === 0) return;
        log.info({ count: active.length }, 'exchange-core online: replaying stream:start for active pairs');
        // Небольшая задержка, чтобы exchange-core успел подписаться на stream:start
        setTimeout(() => {
          for (const { symbol, channels } of active) {
            pub.publish('stream:start', JSON.stringify({ symbol, channels }));
            log.info({ symbol }, 'replayed stream:start');
          }
        }, 2000);
      }
    }
  } catch (e) { log.error(e); }
});

setInterval(() => {
  hb.set('heartbeat:subscription-core', Date.now().toString(), 'EX', 30);
  hb.set('stat:active_pairs', manager.getActivePairCount().toString(), 'EX', 30);
}, 5_000);

process.on('SIGTERM', () => { sub.quit(); pub.quit(); hb.quit(); process.exit(0); });
log.info('subscription-core started');
