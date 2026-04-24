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
    private readonly onStatusChange: () => Promise<void>,
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

        // Шаг 1: обновляем heartbeats
        for (const id of ids) {
          try {
            const val = await this.valkey.get(`heartbeat:${id}`)
            if (val) {
              let payload: HeartbeatPayload
              try {
                payload = JSON.parse(val)
              } catch {
                payload = { ts: parseInt(val, 10) || Date.now() }
              }
              this.registry.heartbeat(id, payload.error)
            }
          } catch (err) {
            this.log.error({ id, err }, 'Failed to process heartbeat for module')
          }
        }

        // Шаг 2: tick (пересчёт статусов по таймаутам)
        this.registry.tick()

        // Шаг 3: публикуем события смены статуса
        try {
          for (const m of this.registry.all()) {
            const prev = this.prevStatus.get(m.id)
            if (m.status === 'online' && prev !== 'online') {
              await this.valkey.publish('module:online', JSON.stringify({ id: m.id }))
            }
            this.prevStatus.set(m.id, m.status)
          }
        } catch (err) {
          this.log.error({ err }, 'HealthMonitor step 3 failed: publish module:online')
        }

        // FIX #5: onStatusChange в отдельном try/catch с меткой шага
        // Раньше ошибки подавлялись внешним catch без контекста
        try {
          await this.onStatusChange()
        } catch (err) {
          this.log.error({ err }, 'HealthMonitor step 4 failed: onStatusChange (broadcast)')
        }
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
