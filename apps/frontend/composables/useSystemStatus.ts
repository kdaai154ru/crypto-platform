// apps/frontend/composables/useSystemStatus.ts
import { onScopeDispose } from 'vue'
import { useSystemStore } from '~/stores/system.store'
import type { SystemStatusPayload } from '@crypto-platform/types'

export function useSystemStatus() {
  const sysStore = useSystemStore()
  const { subscribe, unsubscribe, onReady } = useWsClient()

  function handler(data: unknown) {
    sysStore.update(data as SystemStatusPayload)
  }

  // Register handler immediately — broadcast channel, no subscribe msg needed.
  // onReady ensures the handler is in place before WS starts delivering frames.
  let cancelReady: (() => void) | null = null

  function mount() {
    subscribe('system_status', '', handler)
  }

  cancelReady = onReady(mount)

  // Also subscribe right away for the case WS was already open before
  // this composable was called (e.g. HMR reload with live socket)
  if (import.meta.client) {
    subscribe('system_status', '', handler)
  }

  onScopeDispose(() => {
    unsubscribe('system_status', '', handler)
    cancelReady?.()
  })

  return sysStore
}
