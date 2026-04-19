// apps/frontend/composables/useSystemStatus.ts
import { ref } from 'vue'
import type { SystemStatusPayload } from '@crypto-platform/types'

export function useSystemStatus() {
  const status = ref<SystemStatusPayload|null>(null)
  const { subscribe } = useWsClient()

  subscribe('system:status', '', (data) => {
    status.value = data as SystemStatusPayload
  })
  return { status }
}
