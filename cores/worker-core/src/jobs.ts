// cores/worker-core/src/jobs.ts
import type Valkey from 'iovalkey';
import type { Job } from './scheduler.js';

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
        const keys = await valkey.keys('heartbeat:*');
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
        const modules = await valkey.keys('heartbeat:*');
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