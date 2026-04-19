// apps/orchestrator/src/health-monitor.ts
import type Valkey from 'iovalkey'
import type { ModuleRegistry } from './module-registry.js'
import type { Logger } from '@crypto-platform/logger'

export class HealthMonitor {
  private timer?: ReturnType<typeof setInterval>
  constructor(
    private readonly registry: ModuleRegistry,
    private readonly valkey: Valkey,
    private readonly onStatusChange: () => void,
    private readonly log: Logger
  ) {}

  start(): void {
    this.timer = setInterval(async () => {
      // read heartbeats from Valkey
      const ids = [...this.registry.all().map(m=>m.id)]
      for (const id of ids) {
        const val = await this.valkey.get(`heartbeat:${id}`)
        if (val) this.registry.heartbeat(id)
      }
      this.registry.tick()
      this.onStatusChange()
    }, 5_000)
  }
  stop(): void { clearInterval(this.timer) }
}
