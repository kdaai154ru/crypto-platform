<!-- apps/frontend/components/widgets/ScreenerRsiWidget.vue -->
<template>
  <div class="h-full overflow-auto px-2 py-1">
    <table class="w-full text-xs">
      <thead>
        <tr class="text-muted border-b border-border">
          <th class="text-left pb-1">Symbol</th>
          <th v-for="tf in tfs" :key="tf" class="text-center pb-1">{{ tf }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in tableRows" :key="row.symbol" class="border-t border-border/50 hover:bg-surface-offset">
          <td class="py-1 font-medium">{{ row.symbol }}</td>
          <td v-for="tf in tfs" :key="tf" class="text-center">
            <span v-if="row[tf]" :class="rsiColor(row[tf] as number)" class="px-1.5 py-0.5 rounded text-[10px]">
              {{ (row[tf] as number).toFixed(1) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { ScreenerRow } from '@crypto-platform/types'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'

const tfs = ['5m', '15m', '1h', '4h', '1d']
const rows = ref<Map<string, Record<string, number>>>(new Map())

const tableRows = computed(() =>
  [...rows.value.entries()]
    .map(([symbol, r]) => ({ symbol, ...r }))
    .slice(0, 30)
)

const rsiColor = (v: number) =>
  v >= 70 ? 'bg-red-500/20 text-red-400' :
  v <= 30 ? 'bg-green-500/20 text-green-400' :
  'text-muted'

useWidgetSubscription('screener-rsi', ['screener:update'], '',
  (_ch, data) => {
    const arr = data as ScreenerRow[]
    for (const r of arr) {
      if (r.screener !== 'rsi') continue
      const cur = rows.value.get(r.symbol) ?? {}
      cur[r.tf] = r.value
      rows.value.set(r.symbol, cur)
    }
  }
)
</script>