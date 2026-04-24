// cores/alert-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import type { AlertRule } from './alert-rule.js';
import { parseAlertRule } from './alert-rule.js';
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
const pub = new Valkey(VALKEY_OPTS);
const hb  = new Valkey(VALKEY_OPTS);
const db  = new Valkey(VALKEY_OPTS);

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));
db.on('error',  (e: Error) => log.warn({ err: e.message }, 'db connection error'));

const evaluator  = new AlertEvaluator(log, db);
const dispatcher = new NotificationDispatcher(log);

let rules: AlertRule[] = [];

async function loadRules(): Promise<void> {
  try {
    const hash = await db.hgetall('alert:rules');
    if (!hash) {
      rules = [];
      log.debug('alert:rules is empty');
      return;
    }
    const loaded: AlertRule[] = [];
    for (const [id, raw] of Object.entries(hash)) {
      const rule = parseAlertRule(raw);
      if (!rule) {
        log.warn({ id }, 'invalid or malformed AlertRule, skipping');
        continue;
      }
      if (rule.enabled) loaded.push(rule);
    }
    rules = loaded;
    log.info({ count: rules.length }, 'alert rules loaded from Redis');
  } catch (e) {
    log.error(e, 'failed to load alert rules from Redis');
  }
}

// FIX A-04: обработчики событий регистрируем здесь, но subscribe/psubscribe
// вызываются ТОЛЬКО внутри start() ПОСЛЕ await loadRules() —
// так исключается race condition когда первые pmessage приходят раньше rules.
sub.on('message', (ch: string, _msg: string) => {
  if (ch === 'alert:rules:updated') {
    loadRules().catch((e: unknown) => log.error(e));
  }
});

sub.on('pmessage', (_pat: string, ch: string, msg: string) => {
  try {
    const parts = ch.split(':'); // indicator:{symbol}:{tf}:{name}
    if (parts.length < 4) return;
    const [, symbol, , name] = parts;
    const { value } = JSON.parse(msg) as { value: number };
    const events = evaluator.evaluate(rules, String(name), symbol!, value);
    for (const ev of events) {
      const rule = rules.find(r => r.id === ev.ruleId)!;
      if (!rule) continue;
      const updated = { ...rule, lastTriggered: Date.now() };
      db.hset('alert:rules', rule.id, JSON.stringify(updated)).catch(
        (e: unknown) => log.warn(e, 'failed to update lastTriggered')
      );
      pub.publish('alert:triggered', JSON.stringify(ev));
      dispatcher.dispatch(ev, rule).catch((e: unknown) => log.error(e));
    }
  } catch (e) { log.error(e); }
});

let hbTimer: ReturnType<typeof setInterval> | null = null;
let reloadTimer: ReturnType<typeof setInterval> | null = null;

const shutdown = () => {
  if (hbTimer)     clearInterval(hbTimer);
  if (reloadTimer) clearInterval(reloadTimer);
  sub.quit();
  pub.quit();
  hb.quit();
  db.quit();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

async function start(): Promise<void> {
  // FIX A-04: loadRules и loadPrevValues ПЕРЕД subscribe — rules гарантированно
  // заполнены к моменту когда первое pmessage от indicator:* будет обработано.
  await loadRules();
  await evaluator.loadPrevValues();

  // Теперь безопасно подписываться — rules уже загружены
  await sub.subscribe('alert:rules:updated');
  await sub.psubscribe('indicator:*');

  // FIX A-19/A-20: сохраняем refs таймеров для clearInterval при shutdown
  hbTimer     = setInterval(() => hb.set('heartbeat:alert-core', Date.now().toString(), 'EX', 30), 5_000);
  reloadTimer = setInterval(() => loadRules().catch((e: unknown) => log.error(e)), 60_000);

  log.info('alert-core started');
}

start().catch((e) => { log.fatal(e); process.exit(1); });
