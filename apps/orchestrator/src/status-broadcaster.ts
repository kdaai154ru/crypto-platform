// apps/orchestrator/src/status-broadcaster.ts
import type Valkey from 'iovalkey'
import type { ModuleState, ExchangeState, SystemStatusPayload } from '@crypto-platform/types'

export class StatusBroadcaster {
  constructor(private readonly valkey: Valkey) {}

  async broadcast(modules: ModuleState[], exchanges: ExchangeState[], activePairs: number, activeClients: number): Promise<void> {
    const payload: SystemStatusPayload = { ts:Date.now(), modules, exchanges, activePairs, activeClients }
    const json = JSON.stringify(payload)
    await Promise.all([
      this.valkey.set('system:status:modules', JSON.stringify(modules), 'EX', 60),
      this.valkey.set('system:status:exchanges', JSON.stringify(exchanges), 'EX', 60),
      this.valkey.publish('system:status', json)
    ])
  }
}
