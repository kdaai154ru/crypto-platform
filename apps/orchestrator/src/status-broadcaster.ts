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
        // Кэшируем модули и статусы бирж (как и раньше)
        this.valkey.set('system:status:modules', JSON.stringify(modules), 'EX', 60),
        this.valkey.set('system:status:exchanges', JSON.stringify(exchanges), 'EX', 60),
        // Добавляем в стрим system:status с MAXLEN
        this.valkey.xadd(
          'system:status',
          '*',
          'data',
          json,
          'MAXLEN',
          '~',
          STREAM_MAXLEN
        ),
      ]);
    } catch (err) {
      this.log.error({ err }, 'Failed to broadcast system status');
    }
  }
}