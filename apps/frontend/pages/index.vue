<!-- apps/frontend/pages/index.vue -->
<template>
  <DashboardGrid />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useSystemStore } from '~/stores/system.store'
import { useWsClient } from '~/composables/useWsClient'
import type { SystemStatusPayload } from '@crypto-platform/types'

const sysStore = useSystemStore()
const { connected, subscribe } = useWsClient()

watch(connected, (v) => {
  if (!v) return
  subscribe('system:status', '', (d) => {
    sysStore.update(d as SystemStatusPayload)
  })
}, { immediate: true })
</script>