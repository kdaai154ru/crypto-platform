<!-- apps/frontend/components/widgets/TradesTapeWidget.vue -->
<template>
  <div class="h-full overflow-y-auto font-mono text-xs px-2 py-1 space-y-0.5">
    <div
      v-for="t in displayTrades"
      :key="t.tradeId ?? t.ts"
      :class="[
        'flex justify-between items-center py-0.5 px-1 rounded',
        t.side === 'buy' ? 'text-green-400' : 'text-red-400',
        t.isLarge ? 'bg-yellow-400/10 font-bold' : ''
      ]"
    >
      <span>{{ t.side.toUpperCase() }}</span>
      <span>{{ t.price.toFixed(2) }}</span>
      <span>{{ t.qty.toFixed(4) }}</span>
      <span class="text-muted">{{ t.sizeLabel }}</span>
    </div>
    <div v-if="!displayTrades.length" class="text-center py-8 text-faint text-xs">
      Waiting for trades…
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { NormalizedTrade } from '@crypto-platform/types'
import { useWsClient } from '~/composables/useWsClient'

const props = withDefaults(
  defineProps<{ symbol?: string }>(),
  { symbol: 'BTC/USDT' }
)

const trades = ref<NormalizedTrade[]>([])
const { subscribe, unsubscribe, connected } = useWsClient()

// Каналы ws-gateway:
//   CHANNEL_MAP 'trades:stream' → 'trades'
//   CHANNEL_MAP 'trades:large'  → 'trades_large'
// Gateway доставляет сообщение { type:'trades', data: NormalizedTrade }
// Фильтрация по symbol делается в callback (gateway может слать все символы)
let tradeCb: ((d: unknown) => void) | null = null
let largeCb: ((d: unknown) => void) | null = null
let currentSymbol = ''

function push(t: NormalizedTrade) {
  trades.value.push(t)
  if (trades.value.length > 300) trades.value.splice(0, trades.value.length - 300)
}

function mountSub(sym: string) {
  // Отписываемся от старого символа
  if (tradeCb) unsubscribe('trades', currentSymbol, tradeCb)
  if (largeCb) unsubscribe('trades_large', currentSymbol, largeCb)
  trades.value = []
  currentSymbol = sym

  tradeCb = (d: unknown) => {
    const t = d as NormalizedTrade & { symbol?: string }
    if (t.symbol && t.symbol !== sym) return
    push(t)
  }
  largeCb = (d: unknown) => {
    const t = d as NormalizedTrade & { symbol?: string }
    if (t.symbol && t.symbol !== sym) return
    push({ ...t, isLarge: true })
  }

  subscribe('trades', sym, tradeCb)
  subscribe('trades_large', sym, largeCb)
}

onMounted(() => { if (connected.value) mountSub(props.symbol) })

watch(() => props.symbol, (sym) => {
  if (sym && connected.value) mountSub(sym)
})

watch(connected, (v) => {
  if (v) mountSub(props.symbol)
  else {
    if (tradeCb) unsubscribe('trades', currentSymbol, tradeCb)
    if (largeCb) unsubscribe('trades_large', currentSymbol, largeCb)
    tradeCb = null
    largeCb = null
  }
})

onUnmounted(() => {
  if (tradeCb) unsubscribe('trades', currentSymbol, tradeCb)
  if (largeCb) unsubscribe('trades_large', currentSymbol, largeCb)
})

// Выводим в обратном порядке (новые сверху)
const displayTrades = computed(() => trades.value.slice().reverse())
</script>
