// cores/alert-core/src/main.ts
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
const pub = new Valkey(VALKEY_OPTS); // для публикации alert:triggered
const hb  = new Valkey(VALKEY_OPTS);
const db  = new Valkey(VALKEY_OPTS); // для чтения правил из Redis

sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub connection error'));
pub.on('error', (e: Error) => log.warn({ err: e.message }, 'pub connection error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb connection error'));
db.on('error',  (e: Error) => log.warn({ err: e.message }, 'db connection error'));

const evaluator  = new AlertEvaluator(log);
const dispatcher = new NotificationDispatcher(log);

// FIX: правила хранятся в Redis hash `alert:rules` (field=ruleId, value=JSON)
// Структура: HSET alert:rules <id> <JSON AlertRule>
// Фронтенд/API записывает правила через HSET при создании/обновлении
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
      try {
        const rule = JSON.parse(raw) as AlertRule;
        if (rule.enabled) loaded.push(rule);
      } catch {
        log.warn({ id }, 'invalid rule JSON, skipping');
      }
    }
    rules = loaded;
    log.info({ count: rules.length }, 'alert rules loaded from Redis');
  } catch (e) {
    log.error(e, 'failed to load alert rules from Redis');
    // сохраняем старые правила — не сбрасываем до пустого массива
  }
}

// Подписываемся на обновления правил в реальном времени
// API публикует 'alert:rules:updated' после каждого HSET/HDEL
sub.subscribe('alert:rules:updated', (e: unknown) => { if (e) log.error(e); });
sub.psubscribe('indicator:*', (e: unknown) => { if (e) log.error(e); });

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
    const { value } = JSON.parse(msg);
    const events = evaluator.evaluate(rules, String(name), symbol!, value);
    for (const ev of events) {
      const rule = rules.find(r => r.id === ev.ruleId)!;
      if (!rule) continue;
      // обновляем lastTriggered в Redis
      const updated = { ...rule, lastTriggered: Date.now() };
      db.hset('alert:rules', rule.id, JSON.stringify(updated)).catch(
        (e: unknown) => log.warn(e, 'failed to update lastTriggered')
      );
      // публикуем событие для фронтенда через ws-gateway
      pub.publish('alert:triggered', JSON.stringify(ev));
      dispatcher.dispatch(ev, rule).catch((e: unknown) => log.error(e));
    }
  } catch (e) { log.error(e); }
});

setInterval(() => hb.set('heartbeat:alert-core', Date.now().toString(), 'EX', 30), 5_000);
// Перегружаем правила каждые 60с как fallback (на случай потери pub/sub)
setInterval(() => loadRules().catch((e: unknown) => log.error(e)), 60_000);

process.on('SIGTERM', () => { sub.quit(); pub.quit(); hb.quit(); db.quit(); process.exit(0); });
process.on('SIGINT',  () => { sub.quit(); pub.quit(); hb.quit(); db.quit(); process.exit(0); });

async function start(): Promise<void> {
  // Загружаем правила ДО начала обработки сообщений
  await loadRules();
  log.info('alert-core started');
}

start().catch((e) => { log.fatal(e); process.exit(1); });
