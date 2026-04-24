// apps/orchestrator/src/module-registry.ts
import type { ModuleState, ModuleStatus } from '@crypto-platform/types';
import type { Logger } from '@crypto-platform/logger';

const HEARTBEAT_TIMEOUT = 10_000;
const RESTART_TIMEOUT = 30_000;
const OFFLINE_TIMEOUT = 60_000;

export const MODULE_IDS = [
  'exchange-core',
  'normalizer-core',
  'subscription-core',
  'aggregator-core',
  'trades-core',
  'indicator-core',
  'screener-core',
  'alert-core',
  'derivatives-core',
  'whale-core',
  'etf-core',
  'options-core',
  'worker-core',
  'storage-core',
];

export interface ModuleRegistryMetrics {
  restartsCounter?: {
    inc: (labels?: Record<string, string>) => void;
  };
}

export class ModuleRegistry {
  private states = new Map<string, ModuleState>();
  private metrics: ModuleRegistryMetrics;

  constructor(
    private readonly log: Logger,
    metrics?: ModuleRegistryMetrics
  ) {
    this.metrics = metrics || {};
    for (const id of MODULE_IDS) {
      this.states.set(id, {
        id,
        status: 'offline',
        lastHeartbeat: 0,
        restarts: 0,
        uptimeMs: 0,
        startedAt: 0,
      });
    }
  }

  heartbeat(id: string, error?: string): void {
    const s = this.states.get(id);
    if (!s) return;
    const wasOffline = s.status === 'offline' || s.status === 'restarting';
    const now = Date.now();
    s.lastHeartbeat = now;
    s.error = error;
    const newStatus = error ? 'degraded' : 'online';

    if (wasOffline && newStatus === 'online') {
      s.restarts++;
      s.startedAt = now;
      if (this.metrics.restartsCounter) {
        this.metrics.restartsCounter.inc({ module: id });
      }
    } else if (s.startedAt === 0 && newStatus === 'online') {
      s.startedAt = now;
    }

    s.status = newStatus;
  }

  tick(): ModuleState[] {
    const now = Date.now();
    for (const [, s] of this.states) {
      if (s.status === 'online' || s.status === 'degraded') {
        const gap = now - s.lastHeartbeat;

        if (gap > OFFLINE_TIMEOUT) {
          s.status = 'offline';
        } else if (gap > RESTART_TIMEOUT) {
          s.status = 'restarting';
        } else if (gap > HEARTBEAT_TIMEOUT) {
          // FIX #8: деградируем только если модуль был online
          // Если heartbeat уже выставил degraded (из-за error в payload) — не перезаписываем
          if (s.status === 'online') {
            s.status = 'degraded';
          }
        }

        if (s.status === 'online' && s.startedAt > 0) {
          s.uptimeMs = now - s.startedAt;
        }
      }
    }
    return [...this.states.values()];
  }

  all(): ModuleState[] {
    return [...this.states.values()];
  }

  get(id: string): ModuleState | undefined {
    return this.states.get(id);
  }

  reset(id: string): void {
    const s = this.states.get(id);
    if (s) {
      s.status = 'offline';
      s.lastHeartbeat = 0;
      s.error = undefined;
      s.startedAt = 0;
      s.uptimeMs = 0;
    }
  }

  getOffline(): string[] {
    const result: string[] = [];
    for (const [id, s] of this.states) {
      if (s.status === 'offline' || s.status === 'restarting') {
        result.push(id);
      }
    }
    return result;
  }
}
