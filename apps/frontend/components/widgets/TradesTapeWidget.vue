<!-- apps/frontend/components/widgets/TradesTapeWidget.vue -->
<template>
  <div class="h-full overflow-y-auto font-mono text-xs px-2 py-1 space-y-0.5">
    <div v-for="t in trades.slice().reverse()" :key="t.tradeId ?? t.ts"
         :class="['flex justify-between items-center py-0.5 px-1 rounded',
                  t.side==='buy'?'text-green-400':'text-red-400',
                  t.isLarge?'bg-yellow-400/10 font-bold':'']">
      <span>{{ t.side.toUpperCase() }}</span>
      <span>{{ t.price.toFixed(2) }}</span>
      <span>{{ t.qty.toFixed(4) }}</span>
      <span class="text-muted">{{ t.sizeLabel }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { NormalizedTrade } from '@crypto-platform/types'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const props = withDefaults(defineProps<{symbol?:string}>(), {symbol:'BTC/USDT'})
const trades = ref<NormalizedTrade[]>([])
useWidgetSubscription(`tape-${props.symbol}`,
  [`trades:${props.symbol}`,`trades:large`], props.symbol,
  (_ch, data) => {
    trades.value.push(data as NormalizedTrade)
    if (trades.value.length > 200) trades.value.shift()
  }
)
</script>
