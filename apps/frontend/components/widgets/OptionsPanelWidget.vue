<!-- apps/frontend/components/widgets/OptionsPanelWidget.vue -->
<template>
  <div class="p-3 text-xs" style="color:var(--color-text-muted)">
    <p style="margin-bottom:6px;font-weight:500;color:var(--color-text)">Options Analytics</p>
    <div v-if="data">
      <div class="flex justify-between py-1" style="border-bottom:1px solid var(--color-border-subtle)">
        <span>Put/Call Ratio</span><span class="num" style="color:var(--color-text)">{{ data.pcr?.toFixed(2) ?? '—' }}</span>
      </div>
      <div class="flex justify-between py-1" style="border-bottom:1px solid var(--color-border-subtle)">
        <span>Max Pain</span><span class="num" style="color:var(--color-text)">${{ data.maxPain?.toLocaleString() ?? '—' }}</span>
      </div>
      <div class="flex justify-between py-1">
        <span>GEX</span><span class="num" style="color:var(--color-text)">${{ data.gex ? (data.gex/1e6).toFixed(0)+'M' : '—' }}</span>
      </div>
    </div>
    <p v-else style="color:var(--color-text-faint)">Awaiting data…</p>
  </div>
</template>
<script setup lang="ts">
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const data = ref<any>(null)
useWidgetSubscription('options-panel', ['options:update'], '', (_, d) => { data.value = d })
</script>