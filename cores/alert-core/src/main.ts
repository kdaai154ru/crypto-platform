// cores/alert-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import { z } from 'zod';
import { AlertEvaluator } from './alert-evaluator.js';
import { AlertRule, AlertRuleSchema } from './alert-rule.js';
import { createMetricsServer, type MetricsServer } from '@crypto-platform/metrics';

const env = loadEnv(
  BaseSchema.merge(ValkeySchema).merge(
    z.object({ METRICS_PORT: z.coerce.number().default(4010) })
  )
);
void env;
const log = createLogger('alert-core');

const db  = createValkeyClient();
const sub = createValkeyClient();
const hb  = createValkeyClient();

db.on('error',  (e: Error) => log.warn({ err: e.message }, 'db error'));
sub.on('error', (e: Error) => log.warn({ err: e.message }, 'sub error'));
hb.on('error',  (e: Error) => log.warn({ err: e.message }, 'hb error'));

const evaluator = new AlertEvaluator(log, db);

let rules: AlertRule[] = [];

async function loadRules(): Promise<void> {
  try {
    const raw = await db.hgetall('alert:rules');
    if (!raw) { rules = []; return; }
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
    evaluator.pruneLastTriggered(new Set(parsed.map(r => r.id)));
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
let hbTimer: ReturnType<typeof setInterval> | null = null;
let reloadTimer: ReturnType<typeof setInterval> | null = null;

async function start(): Promise<void> {
  metricsServer = await createMetricsServer(env.METRICS_PORT);
  log.info({ port: env.METRICS_PORT }, 'Metrics server started');

  await loadRules();
  await evaluator.loadPrevValues();

  sub.on('message', (ch: string) => {
    if (ch === 'alert:rules:updated') {
      loadRules().catch((e) => log.error(e, 'reload rules failed'));
    }
  });

  sub.on('pmessage', (_pattern: string, ch: string, msg: string) => {
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

  await new Promise<void>((resolve, reject) => {
    sub.subscribe('alert:rules:updated', (e) => { if (e) reject(e); else resolve(); });
  });

  await new Promise<void>((resolve, reject) => {
    sub.psubscribe('indicator:*', (e) => { if (e) reject(e); else resolve(); });
  });

  hbTimer = setInterval(() => {
    hb.set('heartbeat:alert-core', Date.now().toString(), 'EX', 30)
      .catch((e: Error) => log.warn({ err: e.message }, 'hb set failed'));
  }, 5_000);

  reloadTimer = setInterval(() => {
    loadRules().catch((e) => log.error(e, 'periodic reload rules failed'));
  }, 60_000);

  const shutdown = async () => {
    log.info('Shutting down alert-core...');
    if (hbTimer) clearInterval(hbTimer);
    if (reloadTimer) clearInterval(reloadTimer);
    await sub.quit();
    await db.quit();
    await hb.quit();
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
