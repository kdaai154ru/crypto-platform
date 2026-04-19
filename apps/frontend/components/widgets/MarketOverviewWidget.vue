<!-- apps/frontend/components/widgets/MarketOverviewWidget.vue -->
<template>
  <div class="flex items-center gap-6 px-4 h-full overflow-x-auto text-xs">
    <div v-for="t in tickers" :key="t.symbol" class="flex flex-col min-w-[100px]">
      <span class="text-muted">{{ t.symbol }}</span>
      <span class="text-base font-mono font-semibold">{{ t.last.toFixed(2) }}</span>
      <span :class="t.change24h>=0?'text-green-400':'text-red-400'">
        {{ t.change24h>=0?'+':'' }}{{ t.change24h.toFixed(2) }}%
      </span>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { NormalizedTicker } from '@crypto-platform/types'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const DEFAULT_SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT']
const tickers = ref<NormalizedTicker[]>([])
for (const sym of DEFAULT_SYMBOLS) {
  useWidgetSubscription(`overview-${sym}`, [`ticker:${sym}`], sym, (_,d) => {
    const idx = tickers.value.findIndex(t=>t.symbol===sym)
    const t = d as NormalizedTicker
    if (idx>=0) tickers.value[idx]=t; else tickers.value.push(t)
  })
}
</script>
