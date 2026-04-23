// apps/orchestrator/src/module-registry.ts
import type { ModuleState, ModuleStatus } from '@crypto-platform/types'
import type { Logger } from '@crypto-platform/logger'

const HEARTBEAT_TIMEOUT   = 10_000
const RESTART_TIMEOUT     = 30_000
const OFFLINE_TIMEOUT     = 60_000

export const MODULE_IDS = [
  'exchange-core','normalizer-core','subscription-core','aggregator-core',
  'trades-core','indicator-core','screener-core','alert-core',
  'derivatives-core','whale-core','etf-core','options-core','worker-core','storage-core'
]

/**
 * Реестр состояний модулей платформы.
 * Отвечает за хранение, обновление и расчет статусов модулей на основе heartbeat'ов.
 */
export class ModuleRegistry {
  private states = new Map<string, ModuleState>()

  constructor(private readonly log: Logger) {
    for (const id of MODULE_IDS) {
      this.states.set(id, {
        id,
        status: 'offline',
        lastHeartbeat: 0,
        restarts: 0,
        uptimeMs: 0,
        startedAt: 0
      })
    }
  }

  /**
   * Обновляет heartbeat модуля.
   * Если модуль был offline/restarting и переходит в online, увеличивает счетчик restarts.
   * @param id Идентификатор модуля
   * @param error Опциональное сообщение об ошибке (переводит статус в degraded)
   */
  heartbeat(id: string, error?: string): void {
    const s = this.states.get(id)
    if (!s) return
    const wasOffline = s.status === 'offline' || s.status === 'restarting'
    const now = Date.now()
    s.lastHeartbeat = now
    s.error = error
    const newStatus = error ? 'degraded' : 'online'
    
    if (wasOffline && newStatus === 'online') {
      s.restarts++
      s.startedAt = now
    } else if (s.startedAt === 0 && newStatus === 'online') {
      // первый запуск — restarts не увеличиваем
      s.startedAt = now
    }
    
    s.status = newStatus
  }

  /**
   * Выполняет периодическую проверку таймаутов и пересчитывает статусы.
   * @returns Массив текущих состояний всех модулей
   */
  tick(): ModuleState[] {
    const now = Date.now()
    for (const [id, s] of this.states) {
      if (s.status === 'online' || s.status === 'degraded') {
        const gap = now - s.lastHeartbeat
        if (gap > OFFLINE_TIMEOUT) {
          s.status = 'offline'
        } else if (gap > RESTART_TIMEOUT) {
          s.status = 'restarting'
        } else if (gap > HEARTBEAT_TIMEOUT) {
          s.status = 'degraded'
        }
        // пересчет uptime только если модуль online и есть startedAt
        if (s.status === 'online' && s.startedAt > 0) {
          s.uptimeMs = now - s.startedAt
        } else if (s.status !== 'online') {
          // если не online, uptime не растет
        }
      }
    }
    return [...this.states.values()]
  }

  /**
   * Возвращает все текущие состояния модулей.
   */
  all(): ModuleState[] {
    return [...this.states.values()]
  }

  /**
   * Возвращает состояние конкретного модуля по ID.
   */
  get(id: string): ModuleState | undefined {
    return this.states.get(id)
  }

  /**
   * Сбрасывает состояние модуля к начальному (offline).
   * Используется для ручного вмешательства или тестирования.
   */
  reset(id: string): void {
    const s = this.states.get(id)
    if (s) {
      s.status = 'offline'
      s.lastHeartbeat = 0
      s.error = undefined
      s.startedAt = 0
      s.uptimeMs = 0
      // restarts не сбрасываем, это счетчик перезапусков
    }
  }

  /**
   * Возвращает массив ID модулей, которые сейчас offline или restarting.
   */
  getOffline(): string[] {
    const result: string[] = []
    for (const [id, s] of this.states) {
      if (s.status === 'offline' || s.status === 'restarting') {
        result.push(id)
      }
    }
    return result
  }
}