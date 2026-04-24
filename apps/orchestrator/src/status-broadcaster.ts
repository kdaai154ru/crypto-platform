// apps/orchestrator/src/status-broadcaster.ts
import type Valkey from 'iovalkey';
import type { ModuleState, ExchangeState, PublicModuleState } from '@crypto-platform/types';
import type { Logger } from '@crypto-platform/logger';

const STREAM_MAXLEN = 1000;

export class StatusBroadcaster {
  constructor(
    private readonly valkey: Valkey,
    private readonly log: Logger
  ) {}

  async broadcast(
    modules: ModuleState[],
    exchanges: ExchangeState[],
    activePairs: number,
    activeClients: number
  ): Promise<void> {
    const publicModules: PublicModuleState[] = modules.map(m => ({
      id: m.id,
      status: m.status,
    }));

    const payload = {
      ts: Date.now(),
      modules: publicModules,
      exchanges,
      activePairs,
      activeClients,
    };
    const json = JSON.stringify(payload);

    try {
      await Promise.all([
        // FIX #1: сохраняем только publicModules, а не полный ModuleState
        // Было: JSON.stringify(modules) — утекали error/restarts/uptimeMs
        this.valkey.set('system:status:modules', JSON.stringify(publicModules), 'EX', 60),
        this.valkey.set('system:status:exchanges', JSON.stringify(exchanges), 'EX', 60),
        this.valkey.xadd(
          'system:status',
          'MAXLEN',
          '~',
          String(STREAM_MAXLEN),
          '*',
          'data',
          json
        ),
      ]);
    } catch (err) {
      this.log.error({ err }, 'Failed to broadcast system status');
    }
  }
}
