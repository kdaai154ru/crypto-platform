<!-- apps/frontend/components/widgets/MarketOverviewWidget.vue -->
<template>
  <div class="flex items-center gap-6 px-4 h-full overflow-x-auto text-xs">
    <div v-for="t in tickers" :key="t.symbol" class="flex flex-col min-w-[100px]">
      <span class="text-muted">{{ t.symbol }}</span>
      <span class="text-base font-mono font-semibold">{{ t.last.toFixed(2) }}</span>
      <span :class="t.change24h >= 0 ? 'text-green-400' : 'text-red-400'">
        {{ t.change24h >= 0 ? '+' : '' }}{{ t.change24h.toFixed(2) }}%
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { NormalizedTicker } from '@crypto-platform/types'
import { useWsClient } from '~/composables/useWsClient'

const DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']
const tickers = ref<NormalizedTicker[]>([])

// FIX: правильный канал 'ticker' (не 'ticker:BTC/USDT').
// ws-gateway шлёт { type:'ticker', data:{ symbol, last, ... } }.
// Подписываемся один раз на канал 'ticker' per-symbol через subscribe().
const { subscribe, unsubscribe, onReady } = useWsClient()

const handlers: Array<{ sym: string; cb: (d: unknown) => void }> = []

function mount() {
  for (const { sym, cb } of handlers) unsubscribe('ticker', sym, cb)
  handlers.length = 0

  for (const sym of DEFAULT_SYMBOLS) {
    const cb = (d: unknown) => {
      const t = d as NormalizedTicker
      if (t.symbol !== sym) return
      const idx = tickers.value.findIndex(x => x.symbol === sym)
      if (idx >= 0) tickers.value[idx] = t
      else tickers.value.push(t)
    }
    subscribe('ticker', sym, cb)
    handlers.push({ sym, cb })
  }
}

onReady(mount)

import { onUnmounted } from 'vue'
onUnmounted(() => {
  for (const { sym, cb } of handlers) unsubscribe('ticker', sym, cb)
})
</script>
