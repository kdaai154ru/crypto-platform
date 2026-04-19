// apps/orchestrator/src/module-registry.ts
import type { ModuleState, ModuleStatus } from '@crypto-platform/types'
import type { Logger } from '@crypto-platform/logger'

const HEARTBEAT_TIMEOUT   = 10_000  // degraded after 10s silence
const RESTART_TIMEOUT     = 30_000  // restarting after 30s
const OFFLINE_TIMEOUT     = 60_000  // offline after 60s

export const MODULE_IDS = [
  'exchange-core','normalizer-core','subscription-core','aggregator-core',
  'trades-core','indicator-core','screener-core','alert-core',
  'derivatives-core','whale-core','etf-core','options-core','worker-core','storage-core'
]

export class ModuleRegistry {
  private states = new Map<string, ModuleState>()

  constructor(private readonly log: Logger) {
    for (const id of MODULE_IDS) {
      this.states.set(id, { id, status:'offline', lastHeartbeat:0, restarts:0, uptimeMs:0 })
    }
  }

  heartbeat(id: string, error?: string): void {
    const s = this.states.get(id)
    if (!s) return
    const wasOffline = s.status === 'offline'
    s.lastHeartbeat = Date.now()
    s.error = error
    s.status = error ? 'degraded' : 'online'
    if (wasOffline) { s.restarts++; this.log.info({ id }, 'module online') }
  }

  tick(): ModuleState[] {
    const now = Date.now()
    for (const [id, s] of this.states) {
      if (s.status === 'online' || s.status === 'degraded') {
        const gap = now - s.lastHeartbeat
        if (gap > OFFLINE_TIMEOUT)     s.status = 'offline'
        else if (gap > RESTART_TIMEOUT) s.status = 'restarting'
        else if (gap > HEARTBEAT_TIMEOUT) s.status = 'degraded'
        s.uptimeMs = s.status === 'online' ? now - (s.lastHeartbeat - s.uptimeMs) : s.uptimeMs
      }
    }
    return [...this.states.values()]
  }

  all(): ModuleState[] { return [...this.states.values()] }
  get(id: string): ModuleState|undefined { return this.states.get(id) }
}
