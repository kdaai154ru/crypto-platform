// cores/worker-core/src/jobs.ts
import type Valkey from 'iovalkey';
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

export function createJobs(valkey: Valkey): Job[] {
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
        // FIX #3: SCAN вместо KEYS — не блокирует Redis
        const keys = await scanKeys(valkey, 'heartbeat:*');
        let removed = 0;
        for (const key of keys) {
          const ttl = await valkey.ttl(key);
          if (ttl === -1) {
            await valkey.del(key);
            removed++;
          }
        }
        if (removed > 0) {
          console.log(`[stale-cleanup] removed ${removed} stale keys`);
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
        // FIX #3: SCAN вместо KEYS
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
