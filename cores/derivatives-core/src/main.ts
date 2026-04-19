import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { NormalizedOI, NormalizedFunding, NormalizedLiquidation } from '@crypto-platform/types';
import { OITracker, FundingTracker, LiquidationTracker } from './trackers.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('derivatives-core');

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

const oiTracker   = new OITracker();
const fundTracker = new FundingTracker();
const liqTracker  = new LiquidationTracker();

sub.subscribe('norm:oi', 'norm:funding', 'norm:liquidation', (e: unknown) => { if (e) log.error(e); });

sub.on('message', (ch: string, msg: string) => {
  try {
    const d = JSON.parse(msg);
    if (ch === 'norm:oi')               { oiTracker.update(d as NormalizedOI);            pub.publish('deriv:oi',   msg); }
    else if (ch === 'norm:funding')      { fundTracker.update(d as NormalizedFunding);     pub.publish('deriv:fund', msg); }
    else if (ch === 'norm:liquidation')  { liqTracker.add(d as NormalizedLiquidation);     pub.publish('deriv:liq',  msg); }
  } catch (e) { log.error(e); }
});

setInterval(() => hb.set('heartbeat:derivatives-core', Date.now().toString(), 'EX', 30), 5_000);

process.on('SIGTERM', () => { sub.quit(); pub.quit(); hb.quit(); process.exit(0); });
log.info('derivatives-core started');
