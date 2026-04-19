<!-- apps/frontend/components/widgets/WhaleFeedWidget.vue -->
<template>
  <div class="h-full overflow-y-auto font-mono text-xs px-2 py-1 space-y-0.5">
    <div v-for="t in trades.slice().reverse()" :key="t.ts"
         class="flex justify-between py-0.5 px-1 rounded"
         :style="t.side==='buy' ? 'color:var(--color-success)' : 'color:var(--color-error)'">
      <span>{{ t.side.toUpperCase() }}</span>
      <span class="num">{{ t.price.toFixed(2) }}</span>
      <span class="num">${{ (t.usdValue/1000).toFixed(0) }}K</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { NormalizedTrade } from '@crypto-platform/types'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const props = withDefaults(defineProps<{ symbol?: string }>(), { symbol: 'BTC/USDT' })
const trades = ref<NormalizedTrade[]>([])
useWidgetSubscription(`whale-${props.symbol}`, [`trades:large`], props.symbol,
  (_, d) => { trades.value.push(d as NormalizedTrade); if (trades.value.length > 100) trades.value.shift() })
</script>