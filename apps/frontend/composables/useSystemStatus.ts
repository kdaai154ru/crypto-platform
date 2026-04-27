// apps/frontend/composables/useSystemStatus.ts
import { onScopeDispose } from 'vue'
import { useSystemStore } from '~/stores/system.store'
import type { SystemStatusPayload } from '@crypto-platform/types'

export function useSystemStatus() {
  const sysStore = useSystemStore()
  const { subscribe, unsubscribe } = useWsClient()

  function handler(data: unknown) {
    sysStore.update(data as SystemStatusPayload)
  }

  // FIX: подписываемся сразу — system_status это broadcast-канал,
  // ws-gateway шлёт его всем клиентам без subscribe-сообщения.
  // Дублируем вызов subscribe безопасно — useWsClient защищён от дублей через Set.
  subscribe('system_status', '', handler)

  onScopeDispose(() => {
    unsubscribe('system_status', '', handler)
  })

  return sysStore
}
