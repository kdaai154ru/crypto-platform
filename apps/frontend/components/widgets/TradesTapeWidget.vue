<!-- apps/frontend/components/widgets/TradesTapeWidget.vue -->
<template>
  <div class="trades-tape">
    <div class="tape-header">
      <span class="tape-title">Trades</span>
      <span class="tape-symbol">{{ activeSymbol }}</span>
    </div>
    <div class="tape-list" ref="listEl">
      <div
        v-for="t in trades"
        :key="t.id"
        :class="['tape-row', t.side === 'buy' ? 'buy' : 'sell']"
      >
        <span class="t-price">{{ t.price.toFixed(2) }}</span>
        <span class="t-qty">{{ t.qty.toFixed(4) }}</span>
        <span class="t-time">{{ fmtTime(t.ts) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useWsClient } from '~/composables/useWsClient'
import { useSymbolStore } from '~/stores/symbol.store'
import type { NormalizedTrade } from '@crypto-platform/types'

const symbolStore = useSymbolStore()
const { activeSymbol } = storeToRefs(symbolStore)
const { subscribe, unsubscribe, connected } = useWsClient()

const trades = ref<NormalizedTrade[]>([])
const listEl = ref<HTMLElement | null>(null)
const MAX    = 100

let currentCb: ((d: unknown) => void) | null = null
let currentSymbol = ''

function mountSub(sym: string) {
  if (currentCb) unsubscribe('trades', currentSymbol, currentCb)
  currentSymbol = sym
  trades.value  = []
  currentCb = (d: unknown) => {
    const t = d as NormalizedTrade & { symbol?: string }
    if (t.symbol && t.symbol !== sym) return
    trades.value.unshift(t)
    if (trades.value.length > MAX) trades.value.length = MAX
    nextTick(() => {
      if (listEl.value) listEl.value.scrollTop = 0
    })
  }
  subscribe('trades', sym, currentCb)
}

onMounted(() => { if (connected.value) mountSub(activeSymbol.value) })

watch(activeSymbol, (sym) => {
  if (sym && connected.value) mountSub(sym)
})

watch(connected, (v) => {
  if (v) mountSub(activeSymbol.value)
  else { if (currentCb) unsubscribe('trades', currentSymbol, currentCb); currentCb = null }
})

onUnmounted(() => {
  if (currentCb) unsubscribe('trades', currentSymbol, currentCb)
})

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}
</script>

<style scoped>
.trades-tape { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.tape-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.tape-title  { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; }
.tape-symbol { font-size: var(--text-xs); color: var(--color-primary); font-weight: 700; }

.tape-list { flex: 1; overflow-y: auto; }

.tape-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 2px var(--space-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid oklch(from var(--color-border) l c h / 0.3);
}
.tape-row.buy  { color: var(--color-success); }
.tape-row.sell { color: var(--color-notification); }
.t-price { font-weight: 600; }
.t-qty, .t-time { color: var(--color-text-muted); text-align: right; }
</style>
