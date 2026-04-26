<!-- apps/frontend/pages/index.vue -->
<template>
  <DashboardGrid />
</template>

<script setup lang="ts">
import { watch, onMounted } from 'vue'
import { useSystemStore } from '~/stores/system.store'
import { useWsClient } from '~/composables/useWsClient'
import type { SystemStatusPayload } from '@crypto-platform/types'

const sysStore = useSystemStore()
const { connected, subscribe } = useWsClient()

function registerSystemStatus() {
  // ws-gateway sends type='system_status' (underscore), matches CHANNEL_MAP
  subscribe('system_status', '', (d) => {
    sysStore.update(d as SystemStatusPayload)
  })
}

// Register on mount in case WS is already connected (e.g. hot reload)
onMounted(() => {
  if (connected.value) registerSystemStatus()
})

// Also register whenever connection is established / re-established
watch(connected, (v) => {
  if (v) registerSystemStatus()
})
</script>
