<!-- apps/frontend/components/widgets/AlertsPanelWidget.vue -->
<template>
  <div class="h-full overflow-y-auto p-2 text-xs space-y-1">
    <p v-if="!alerts.length" style="color:var(--color-text-faint);padding:8px">No active alerts</p>
    <div v-for="a in alerts" :key="a.id"
         style="padding:6px 8px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-surface-3)">
      <div style="font-weight:500;color:var(--color-text)">{{ a.symbol }}</div>
      <div style="color:var(--color-text-muted)">{{ a.condition }}</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const alerts = ref<any[]>([])
useWidgetSubscription('alerts-panel', ['alerts:triggered'], '', (_, d) => {
  alerts.value.unshift(d); if (alerts.value.length > 50) alerts.value.pop()
})
</script>