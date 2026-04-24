// cores/alert-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { z } from 'zod';
import Valkey from 'iovalkey';
import { AlertEvaluator } from './alert-evaluator.js';
import { AlertRule, AlertRuleSchema } from './alert-rule.js';
import { createMetricsServer, type MetricsServer } from '@crypto-platform/metrics';

const env = loadEnv(
  BaseSchema.merge(ValkeySchema).merge(
    z.object({ METRICS_PORT: z.coerce.number().default(4010) })
  )
);
const log = createLogger('alert-core');

const VALKEY_OPTS = {
  host: env.VALKEY_HOST,
  port: env.VALKEY_PORT,
  retryStrategy: (times: number) => Math.min(times * 100, 3_000),
  keepAlive: 10_000,
  enableOfflineQueue: true,
};

const db = new Valkey(VALKEY_OPTS);
const sub = new Valkey(VALKEY_OPTS);
const hb = new Valkey(VALKEY_OPTS);

db.on('error', (e: Error) => log.warn({ err: e.message }, 'db error'));
sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub error'));
hb.on('error', (e: Error) => log.warn({ err: e.message }, 'hb error'));

const evaluator = new AlertEvaluator(log, db);
let rules: AlertRule[] = [];

async function loadRules(): Promise<void> {
  try {
    const raw = await db.hgetall('alert:rules');
    if (!raw) {
      rules = [];
      return;
    }
    const parsed: AlertRule[] = [];
    for (const [id, json] of Object.entries(raw)) {
      try {
        const obj = JSON.parse(json as string) as unknown;
        const validated = AlertRuleSchema.parse(obj);
        parsed.push({ ...validated, id });
      } catch (e) {
        log.warn({ id, err: e }, 'invalid alert rule, skipping');
      }
    }
    rules = parsed;
    log.info({ count: rules.length }, 'alert rules loaded');
  } catch (e) {
    log.error(e, 'loadRules failed');
  }
}

async function publishAlertEvents(events: ReturnType<AlertEvaluator['evaluate']>): Promise<void> {
  for (const ev of events) {
    db.publish('alert:triggered', JSON.stringify(ev)).catch((e: unknown) =>
      log.warn(e, 'publish alert:triggered failed')
    );
  }
}

let metricsServer: MetricsServer | null = null;
// FIX #12/#13: сохраняем референсы таймеров для clearInterval при shutdown
let hbTimer: ReturnType<typeof setInterval> | null = null;
let reloadTimer: ReturnType<typeof setInterval> | null = null;

async function start(): Promise<void> {
  metricsServer = await createMetricsServer(env.METRICS_PORT);
  log.info({ port: env.METRICS_PORT }, 'Metrics server started');

  // FIX #4: загружаем правила ДО подписки на каналы
  await loadRules();
  await evaluator.loadPrevValues();

  // FIX #4: subscribe ТОЛЬКО после загрузки правил — нет race condition
  await new Promise<void>((resolve, reject) => {
    sub.subscribe('alert:rules:updated', (e) => {
      if (e) reject(e); else resolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    sub.psubscribe('indicator:*', (e) => {
      if (e) reject(e); else resolve();
    });
  });

  sub.on('message', (ch: string) => {
    if (ch === 'alert:rules:updated') {
      loadRules().catch((e) => log.error(e, 'reload rules failed'));
    }
  });

  sub.on('pmessage', (_pattern: string, ch: string, msg: string) => {
    // ch формат: 'indicator:symbol:metric'
    const parts = ch.split(':');
    const symbol = parts[1];
    const metric = parts[2];
    if (!symbol || !metric) return;
    let value: number;
    try {
      const parsed = JSON.parse(msg) as { value?: number } | number;
      value = typeof parsed === 'number' ? parsed : (parsed?.value ?? NaN);
    } catch {
      log.warn({ ch }, 'failed to parse indicator message');
      return;
    }
    if (isNaN(value)) return;
    const events = evaluator.evaluate(rules, metric, symbol, value);
    if (events.length > 0) {
      publishAlertEvents(events).catch((e: unknown) => log.error(e, 'publishAlertEvents failed'));
    }
  });

  // FIX #12: сохраняем ref — clearInterval в shutdown
  hbTimer = setInterval(async () => {
    await hb.set('heartbeat:alert-core', Date.now().toString(), 'EX', 30);
  }, 5_000);

  // FIX #13: сохраняем ref — clearInterval в shutdown
  reloadTimer = setInterval(() => {
    loadRules().catch((e) => log.error(e, 'periodic reload rules failed'));
  }, 60_000);

  const shutdown = async () => {
    log.info('Shutting down alert-core...');
    if (hbTimer) clearInterval(hbTimer);
    if (reloadTimer) clearInterval(reloadTimer);
    sub.quit();
    db.quit();
    hb.quit();
    if (metricsServer) await metricsServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log.info('alert-core started');
}

start().catch((e) => {
  log.fatal(e);
  process.exit(1);
});
