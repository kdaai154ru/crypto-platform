import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { NormalizedTrade } from '@crypto-platform/types';
import { WhaleMonitor } from './whale-monitor.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('whale-core');

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

const monitor = new WhaleMonitor();

sub.subscribe('trades:large', (e: unknown) => { if (e) log.error(e); });

sub.on('message', (_: string, msg: string) => {
  try {
    const trade = JSON.parse(msg) as NormalizedTrade;
    const ev = monitor.process(trade);
    // FIX: .catch() prevents silent unhandled rejection when Valkey is unavailable
    if (ev) {
      pub.publish('whale:event', JSON.stringify(ev))
        .catch((e: Error) => log.error({ err: e.message }, 'publish whale:event failed'));
    }
  } catch (e) { log.error(e); }
});

// FIX: save ref so clearInterval runs in shutdown
const hbTimer = setInterval(
  () => hb.set('heartbeat:whale-core', Date.now().toString(), 'EX', 30),
  5_000,
);

// FIX: unified shutdown handler for both SIGTERM and SIGINT
const shutdown = () => {
  clearInterval(hbTimer);
  sub.quit();
  pub.quit();
  hb.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

log.info('whale-core started');
