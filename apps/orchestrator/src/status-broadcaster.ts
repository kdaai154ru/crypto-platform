// apps/orchestrator/src/status-broadcaster.ts
import type Valkey from 'iovalkey'
import type { ModuleState, ExchangeState, SystemStatusPayload } from '@crypto-platform/types'
import type { Logger } from '@crypto-platform/logger'

interface PublicModuleState {
  id: string
  status: string
}

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
    // Фильтруем внутренние поля для публичного статуса
    const publicModules: PublicModuleState[] = modules.map(m => ({
      id: m.id,
      status: m.status
    }))

    const payload: SystemStatusPayload = {
      ts: Date.now(),
      modules: publicModules as ModuleState[], // совместимо по типам
      exchanges,
      activePairs,
      activeClients
    }
    const json = JSON.stringify(payload)

    try {
      await Promise.all([
        this.valkey.set('system:status:modules', JSON.stringify(modules), 'EX', 60),
        this.valkey.set('system:status:exchanges', JSON.stringify(exchanges), 'EX', 60),
        this.valkey.publish('system:status', json)
      ])
    } catch (err) {
      this.log.error({ err }, 'Failed to broadcast system status')
    }
  }
}