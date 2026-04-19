// apps/orchestrator/src/health-monitor.ts
import type Valkey from 'iovalkey'
import type { ModuleRegistry } from './module-registry.js'
import type { Logger } from '@crypto-platform/logger'

export class HealthMonitor {
  private timer?: ReturnType<typeof setInterval>
  // Отслеживаем предыдущее состояние модулей чтобыопределить переход offline → online
  private prevStatus = new Map<string, string>()

  constructor(
    private readonly registry: ModuleRegistry,
    private readonly valkey: Valkey,
    private readonly onStatusChange: () => void,
    private readonly log: Logger
  ) {}

  start(): void {
    this.timer = setInterval(async () => {
      const ids = [...this.registry.all().map(m => m.id)]
      for (const id of ids) {
        const val = await this.valkey.get(`heartbeat:${id}`)
        if (val) this.registry.heartbeat(id)
      }
      this.registry.tick()

      // Публикуем module:online в Valkey при переходе из offline/restarting → online
      // это нужно subscription-core чтобыон узнал что exchange-core перезапустился
      // и мог повторно отправить stream:start для всех активных пар.
      for (const m of this.registry.all()) {
        const prev = this.prevStatus.get(m.id)
        if (m.status === 'online' && prev !== 'online') {
          await this.valkey.publish('module:online', JSON.stringify({ id: m.id }))
          this.log.info({ id: m.id }, 'module online')
        }
        this.prevStatus.set(m.id, m.status)
      }

      this.onStatusChange()
    }, 5_000)
  }

  stop(): void { clearInterval(this.timer) }
}
