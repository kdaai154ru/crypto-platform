<!-- apps/frontend/components/widgets/TradesTapeWidget.vue -->
<template>
  <div class="trades-tape">
    <!-- виртуальный список: рендерим только видимые строки -->
    <div class="tape-list" ref="listEl" @scroll.passive="onScroll">
      <div class="tape-spacer-top"    :style="{ height: topSpacerH + 'px' }" />
      <div
        v-for="t in visibleTrades"
        :key="t._key"
        :class="['tape-row', t.side === 'buy' ? 'buy' : 'sell']"
      >
        <span class="t-side">{{ t.side === 'buy' ? 'B' : 'S' }}</span>
        <span class="t-price">{{ t.price.toFixed(2) }}</span>
        <span class="t-qty">{{ t.qty.toFixed(4) }}</span>
        <span class="t-time">{{ fmtTime(t.ts) }}</span>
      </div>
      <div class="tape-spacer-bottom" :style="{ height: botSpacerH + 'px' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWsClient } from '~/composables/useWsClient'
import { useSymbolStore } from '~/stores/symbol.store'
import type { NormalizedTrade } from '@crypto-platform/types'

const symbolStore = useSymbolStore()
const { activeSymbol } = storeToRefs(symbolStore)
const { subscribe, unsubscribe, onReady } = useWsClient()

const MAX     = 200
const ROW_H   = 22
const VISIBLE = 30

interface TradeRow extends NormalizedTrade { _key: string }

const trades    = ref<TradeRow[]>([])
const listEl    = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
let _counter    = 0

let currentCb: ((d: unknown) => void) | null = null
let currentSymbol = ''

const startIdx = computed(() => {
  const idx = Math.floor(scrollTop.value / ROW_H)
  return Math.max(0, idx - 5)
})
const endIdx        = computed(() => Math.min(trades.value.length, startIdx.value + VISIBLE + 10))
const visibleTrades = computed(() => trades.value.slice(startIdx.value, endIdx.value))
const topSpacerH    = computed(() => startIdx.value * ROW_H)
const botSpacerH    = computed(() => (trades.value.length - endIdx.value) * ROW_H)

function onScroll() {
  if (listEl.value) scrollTop.value = listEl.value.scrollTop
}

function mountSub(sym: string) {
  if (currentCb) { unsubscribe('trades', currentSymbol, currentCb); currentCb = null }
  currentSymbol = sym
  trades.value  = []
  currentCb = (d: unknown) => {
    const t = d as NormalizedTrade & { symbol?: string }
    if (t.symbol && t.symbol !== sym) return
    const row: TradeRow = {
      ...t,
      _key: (t as unknown as { tradeId?: string }).tradeId ?? `${t.ts}-${++_counter}`,
    }
    trades.value.unshift(row)
    if (trades.value.length > MAX) trades.value.length = MAX
  }
  subscribe('trades', sym, currentCb)
}

onReady(() => mountSub(activeSymbol.value))
watch(activeSymbol, (sym) => { if (sym) mountSub(sym) })
onUnmounted(() => { if (currentCb) unsubscribe('trades', currentSymbol, currentCb) })

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}
</script>

<style scoped>
.trades-tape { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.tape-list   { flex: 1; overflow-y: auto; }
.tape-row {
  display: grid;
  grid-template-columns: 14px 1fr 1fr 1fr;
  padding: 2px var(--space-3);
  height: 22px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid oklch(from var(--color-border) l c h / 0.3);
  box-sizing: border-box;
}
.tape-row.buy  { color: #22c55e; }
.tape-row.sell { color: #ef4444; }
.t-side { font-weight: 700; font-size: 10px; opacity: 0.8; }
.t-price { font-weight: 600; }
.t-qty, .t-time { color: var(--color-text-muted); text-align: right; }
.tape-row.buy  .t-qty,
.tape-row.buy  .t-time  { color: rgba(34,197,94,0.6); }
.tape-row.sell .t-qty,
.tape-row.sell .t-time  { color: rgba(239,68,68,0.6); }
</style>
