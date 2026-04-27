<!-- apps/frontend/components/widgets/EtfFlowWidget.vue -->
<template>
  <div class="p-3 text-xs">
    <p style="color:var(--color-text-muted);margin-bottom:8px">Bitcoin ETF Flows</p>
    <p v-if="!latest" style="color:var(--color-text-faint)">Awaiting data…</p>
    <div v-else class="num" style="font-size:18px;font-weight:600">
      <span :style="(latest.flowUsd ?? 0) >= 0 ? 'color:var(--color-success)' : 'color:var(--color-error)'">
        {{ (latest.flowUsd ?? 0) >= 0 ? '+' : '' }}${{ ((latest.flowUsd ?? 0)/1e6).toFixed(1) }}M
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'

const latest = ref<any>(null)

// broadcast-канал — symbol не используется, но useWidgetSubscription требует Ref<string>
const emptySymbol = computed(() => '')

useWidgetSubscription('etf-flow', ['etf_latest'], emptySymbol, (_, d) => {
  latest.value = d
})
</script>
