import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import type { NormalizedTrade } from '@crypto-platform/types';
import { WhaleMonitor } from './whale-monitor.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('whale-core');

const sub = createValkeyClient();
const pub = createValkeyClient();
const hb  = createValkeyClient();

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const monitor = new WhaleMonitor();

sub.subscribe('trades:large', (e: unknown) => { if (e) log.error(e); });

sub.on('message', (_: string, msg: string) => {
  try {
    const trade = JSON.parse(msg) as NormalizedTrade;
    const ev = monitor.process(trade);
    if (ev) {
      pub.publish('whale:event', JSON.stringify(ev))
        .catch((e: Error) => log.error({ err: e.message }, 'publish whale:event failed'));
    }
  } catch (e) { log.error(e); }
});

const hbTimer = setInterval(
  () => hb.set('heartbeat:whale-core', Date.now().toString(), 'EX', 30),
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

log.info('whale-core started');
