// cores/worker-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import { Scheduler } from './scheduler.js';
import { createJobs } from './jobs.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('worker-core');

const VALKEY_OPTS = {
  host: env.VALKEY_HOST,
  port: env.VALKEY_PORT,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  keepAlive: 10000,
  enableOfflineQueue: true,
};

const valkey = new Valkey(VALKEY_OPTS);
const hb     = new Valkey(VALKEY_OPTS);

valkey.on('error', (e: Error) => log.warn({ err: e.message }, 'valkey connection error'));
hb.on('error',     (e: Error) => log.warn({ err: e.message }, 'hb connection error'));

const scheduler = new Scheduler(log);
// FIX: pass `log` to createJobs so stale-key-cleanup uses pino instead of console.log
const jobs = createJobs(valkey, log);
for (const job of jobs) scheduler.register(job);

const hbInterval = setInterval(
  () => hb.set('heartbeat:worker-core', Date.now().toString(), 'EX', 30),
  5_000,
);

const shutdown = () => {
  clearInterval(hbInterval);
  scheduler.destroy();
  valkey.quit();
  hb.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

log.info({ jobs: jobs.map(j => j.name) }, 'worker-core started');
