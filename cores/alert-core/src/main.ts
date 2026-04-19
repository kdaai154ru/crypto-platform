import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { AlertRule } from './alert-rule.js';
import { AlertEvaluator } from './alert-evaluator.js';
import { NotificationDispatcher } from './notification-dispatcher.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('alert-core');

const VALKEY_OPTS = {
  host: env.VALKEY_HOST,
  port: env.VALKEY_PORT,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  keepAlive: 10000,
  enableOfflineQueue: true,
};

const sub = new Valkey(VALKEY_OPTS);
const hb  = new Valkey(VALKEY_OPTS);

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const evaluator  = new AlertEvaluator(log);
const dispatcher = new NotificationDispatcher(log);

const rules: AlertRule[] = []; // loaded from PG in prod

sub.psubscribe('indicator:*', (e: unknown) => { if (e) log.error(e); });

sub.on('pmessage', (_pat: string, ch: string, msg: string) => {
  try {
    const parts = ch.split(':'); // indicator:{symbol}:{tf}:{name}
    if (parts.length < 4) return;
    const [, symbol, , name] = parts;
    const { value } = JSON.parse(msg);
    const events = evaluator.evaluate(rules, String(name), symbol!, value);
    for (const ev of events) {
      const rule = rules.find(r => r.id === ev.ruleId)!;
      dispatcher.dispatch(ev, rule).catch((e: unknown) => log.error(e));
    }
  } catch (e) { log.error(e); }
});

setInterval(() => hb.set('heartbeat:alert-core', Date.now().toString(), 'EX', 30), 5_000);

process.on('SIGTERM', () => { sub.quit(); hb.quit(); process.exit(0); });
log.info('alert-core started');
