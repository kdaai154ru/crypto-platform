// apps/frontend/composables/useSystemStatus.ts
import { ref, onScopeDispose } from 'vue'
import type { SystemStatusPayload } from '@crypto-platform/types'

export function useSystemStatus() {
  const status = ref<SystemStatusPayload | null>(null)
  const { subscribe, unsubscribe } = useWsClient()

  function handler(data: unknown) {
    status.value = data as SystemStatusPayload
  }

  // ws-gateway sends type='system_status' (underscore, matches CHANNEL_MAP)
  subscribe('system_status', '', handler)

  // Remove this specific callback when the owning component/scope is destroyed
  // to prevent stale handler accumulation across remounts
  onScopeDispose(() => unsubscribe('system_status', '', handler))

  return { status }
}
