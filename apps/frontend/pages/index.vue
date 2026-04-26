<!-- apps/frontend/pages/index.vue -->
<template>
  <DashboardGrid />
</template>

<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import { useSystemStore } from '~/stores/system.store'
import { useWsClient } from '~/composables/useWsClient'
import type { SystemStatusPayload } from '@crypto-platform/types'

const sysStore = useSystemStore()
const { connected, subscribe, unsubscribe } = useWsClient()

function handler(d: unknown) {
  sysStore.update(d as SystemStatusPayload)
}

// immediate:true fires once right away (handles already-connected case)
// and again whenever connected flips true after reconnect.
// Single watch replaces the previous onMounted+watch combo that
// registered two identical callbacks on the very first load.
watch(
  connected,
  (v) => { if (v) subscribe('system_status', '', handler) },
  { immediate: true }
)

// Clean up on page teardown to prevent handler accumulation
onUnmounted(() => unsubscribe('system_status', '', handler))
</script>
