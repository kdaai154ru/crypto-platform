// apps/orchestrator/src/health-monitor.ts
import type Valkey from 'iovalkey'
import type { ModuleRegistry } from './module-registry.js'
import type { Logger } from '@crypto-platform/logger'

interface HeartbeatPayload {
  ts: number
  error?: string
}

export class HealthMonitor {
  private timer?: ReturnType<typeof setInterval>
  private prevStatus = new Map<string, string>()
  private isTicking = false

  constructor(
    private readonly registry: ModuleRegistry,
    private readonly valkey: Valkey,
    private readonly onStatusChange: () => void,
    private readonly log: Logger
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(async () => {
      if (this.isTicking) {
        this.log.warn('HealthMonitor tick skipped due to overlap')
        return
      }
      this.isTicking = true
      try {
        const ids = [...this.registry.all().map(m => m.id)]
        for (const id of ids) {
          try {
            const val = await this.valkey.get(`heartbeat:${id}`)
            if (val) {
              let payload: HeartbeatPayload
              try {
                payload = JSON.parse(val)
              } catch {
                // если не JSON, считаем что это просто ts
                payload = { ts: parseInt(val, 10) || Date.now() }
              }
              this.registry.heartbeat(id, payload.error)
            }
          } catch (err) {
            this.log.error({ id, err }, 'Failed to process heartbeat for module')
          }
        }
        this.registry.tick()

        for (const m of this.registry.all()) {
          const prev = this.prevStatus.get(m.id)
          if (m.status === 'online' && prev !== 'online') {
            await this.valkey.publish('module:online', JSON.stringify({ id: m.id }))
          }
          this.prevStatus.set(m.id, m.status)
        }

        await this.onStatusChange()
      } catch (err) {
        this.log.error({ err }, 'HealthMonitor tick failed')
      } finally {
        this.isTicking = false
      }
    }, 5_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  isRunning(): boolean {
    return !!this.timer
  }
}