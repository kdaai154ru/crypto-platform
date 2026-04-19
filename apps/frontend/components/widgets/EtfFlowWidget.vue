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
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const latest = ref<any>(null)
useWidgetSubscription('etf-flow', ['etf:latest'], '', (_, d) => { latest.value = d })
</script>