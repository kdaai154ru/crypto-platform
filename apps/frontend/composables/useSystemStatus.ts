// apps/frontend/composables/useSystemStatus.ts
import { ref } from 'vue'
import type { SystemStatusPayload } from '@crypto-platform/types'

export function useSystemStatus() {
  const status = ref<SystemStatusPayload|null>(null)
  const { subscribe } = useWsClient()

  // ws-gateway sends type='system_status' (underscore), not 'system:status'
  subscribe('system_status', '', (data) => {
    status.value = data as SystemStatusPayload
  })
  return { status }
}
