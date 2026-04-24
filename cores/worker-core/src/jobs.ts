// cores/worker-core/src/jobs.ts
import type Valkey from 'iovalkey';
import type { Logger } from '@crypto-platform/logger';
import type { Job } from './scheduler.js';

// FIX #3: вспомогательная функция SCAN вместо KEYS
// KEYS блокирует Redis на весь скан — при большом числе ключей это заморозка всего
async function scanKeys(valkey: Valkey, pattern: string): Promise<string[]> {
  const result: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await (valkey as any).scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    result.push(...keys);
  } while (cursor !== '0');
  return result;
}

// FIX: accept Logger as second param so stale-key-cleanup emits structured pino events
// instead of console.log (which bypasses pino transport in production)
export function createJobs(valkey: Valkey, log: Logger): Job[] {
  return [
    {
      name: 'screener-refresh',
      intervalMs: 30_000,
      run: async () => {
        await valkey.publish('worker:screener:refresh', '1');
      },
    },
    {
      name: 'etf-refresh',
      intervalMs: 60 * 60 * 1000,
      run: async () => {
        await valkey.publish('worker:etf:refresh', '1');
      },
    },
    {
      name: 'options-refresh',
      intervalMs: 5 * 60 * 1000,
      run: async () => {
        await valkey.publish('worker:options:refresh', '1');
      },
    },
    {
      name: 'stale-key-cleanup',
      intervalMs: 10 * 60 * 1000,
      run: async () => {
        const keys = await scanKeys(valkey, 'heartbeat:*');
        let removed = 0;
        for (const key of keys) {
          const ttl = await valkey.ttl(key);
          if (ttl === -1) {
            await valkey.del(key);
            removed++;
          }
        }
        // FIX: use pino logger instead of console.log
        if (removed > 0) {
          log.info({ removed }, 'stale-key-cleanup: removed stale heartbeat keys');
        } else {
          log.debug('stale-key-cleanup: no stale keys found');
        }
      },
    },
    {
      name: 'top20-build',
      intervalMs: 60_000,
      run: async () => {
        await valkey.publish('worker:top20:build', '1');
      },
    },
    {
      name: 'system-health-snapshot',
      intervalMs: 15_000,
      run: async () => {
        const modules = await scanKeys(valkey, 'heartbeat:*');
        const snapshot = {
          ts: Date.now(),
          activeModules: modules.length,
        };
        await valkey.set(
          'system:health:snapshot',
          JSON.stringify(snapshot),
          'EX',
          60,
        );
      },
    },
  ];
}
