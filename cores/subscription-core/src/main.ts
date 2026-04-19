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

/**
 * Отвечаем на exchange:ready одним сообщением stream:replay со всеми
 * активными парами. exchange-core обрабатывает их все сразу.
 */
function replayToExchange(): void {
  const active = manager.getActivePairs();
  if (active.length === 0) {
    log.info('exchange:ready received, no active pairs to replay');
    return;
  }
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
      // exchange-core запустился/перезапустился и готов принимать стримы
      replayToExchange();
    }
  } catch (e) { log.error(e); }
});

setInterval(() => {
  hb.set('heartbeat:subscription-core', Date.now().toString(), 'EX', 30);
  hb.set('stat:active_pairs', manager.getActivePairCount().toString(), 'EX', 30);
}, 5_000);

process.on('SIGTERM', () => { sub.quit(); pub.quit(); hb.quit(); process.exit(0); });
log.info('subscription-core started');
