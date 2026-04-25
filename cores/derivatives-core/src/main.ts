import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import type { NormalizedOI, NormalizedFunding, NormalizedLiquidation } from '@crypto-platform/types';
import { OITracker, FundingTracker, LiquidationTracker } from './trackers.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
void env;
const log = createLogger('derivatives-core');

const sub = createValkeyClient();
const pub = createValkeyClient();
const hb  = createValkeyClient();

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
    if (ch === 'norm:oi')              { oiTracker.update(d as NormalizedOI);           pub.publish('deriv:oi',   msg).catch(() => {}); }
    else if (ch === 'norm:funding')    { fundTracker.update(d as NormalizedFunding);    pub.publish('deriv:fund', msg).catch(() => {}); }
    else if (ch === 'norm:liquidation') { liqTracker.add(d as NormalizedLiquidation);  pub.publish('deriv:liq',  msg).catch(() => {}); }
  } catch (e) { log.error(e); }
});

const hbTimer = setInterval(
  () => hb.set('heartbeat:derivatives-core', Date.now().toString(), 'EX', 30),
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
process.on('SIGINT', shutdown);
log.info('derivatives-core started');
