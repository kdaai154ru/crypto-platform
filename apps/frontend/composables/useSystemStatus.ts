// apps/frontend/composables/useSystemStatus.ts
//
// FIX #4: единственный источник подписки на system_status.
// Обновляет глобальный sysStore напрямую — StatusBar.vue и любые другие
// компоненты читают useSystemStore() и всегда видят актуальные данные
// независимо от того, с какой страницы они рендерятся.
//
// Использование: вызвать useSystemStatus() в любом компоненте или layout.
// Повторные вызовы безопасны — callback-guard в useWsClient предотвращает
// дублирование (if (set.has(cb)) return).
import { onScopeDispose } from 'vue'
import { useSystemStore } from '~/stores/system.store'
import type { SystemStatusPayload } from '@crypto-platform/types'

export function useSystemStatus() {
  const sysStore = useSystemStore()
  const { subscribe, unsubscribe } = useWsClient()

  function handler(data: unknown) {
    sysStore.update(data as SystemStatusPayload)
  }

  subscribe('system_status', '', handler)

  // Удаляем callback когда scope уничтожается (компонент/layout размонтирован)
  onScopeDispose(() => unsubscribe('system_status', '', handler))

  // Возвращаем sysStore напрямую — нет смысла дублировать payload в локальный ref
  return sysStore
}
