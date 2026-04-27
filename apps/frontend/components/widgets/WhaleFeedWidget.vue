<!-- apps/frontend/components/widgets/WhaleFeedWidget.vue -->
<template>
  <div class="whale-feed">
    <div class="feed-header">
      <span class="feed-title">Whale Feed</span>
      <span class="feed-sym">{{ symbolStore.activeSymbol }}</span>
    </div>
    <!-- виртуальный список -->
    <div class="feed-list" ref="listEl" @scroll.passive="onScroll">
      <div :style="{ height: topSpacerH + 'px' }" />
      <div v-for="w in visibleWhales" :key="w._key" class="whale-row">
        <span :class="['whale-side', w.side]">{{ w.side.toUpperCase() }}</span>
        <span class="whale-pair">{{ w.symbol }}</span>
        <span class="whale-qty">${{ fmtNum(w.usdValue) }}</span>
        <span class="whale-ex">{{ w.exchange }}</span>
        <span class="whale-time">{{ fmtTime(w.ts) }}</span>
      </div>
      <div :style="{ height: botSpacerH + 'px' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useWsClient } from '~/composables/useWsClient'
import { useSymbolStore } from '~/stores/symbol.store'

interface WhaleTrade {
  _key:     string
  symbol:   string
  side:     'buy' | 'sell'
  qty:      number
  price:    number
  usdValue: number
  exchange: string
  ts:       number
  tradeId?: string
}

const ROW_H   = 26
const VISIBLE = 25
const MAX     = 200

const symbolStore = useSymbolStore()
const { subscribe, unsubscribe, onReady } = useWsClient()
const whales    = ref<WhaleTrade[]>([])
const listEl    = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
let currentCb: ((d: unknown) => void) | null = null
let currentSymbol = ''
let _counter = 0

const startIdx     = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_H) - 3))
const endIdx       = computed(() => Math.min(whales.value.length, startIdx.value + VISIBLE + 6))
const visibleWhales = computed(() => whales.value.slice(startIdx.value, endIdx.value))
const topSpacerH   = computed(() => startIdx.value * ROW_H)
const botSpacerH   = computed(() => (whales.value.length - endIdx.value) * ROW_H)

function onScroll() {
  if (listEl.value) scrollTop.value = listEl.value.scrollTop
}

function mountSub(sym: string) {
  if (currentCb) { unsubscribe('whale_event', currentSymbol, currentCb); currentCb = null }
  currentSymbol = sym
  whales.value  = []
  currentCb = (d: unknown) => {
    const raw = d as { symbol: string; side: 'buy'|'sell'; qty: number; price: number; usdValue: number; exchange: string; ts: number; tradeId?: string }
    if (raw.symbol !== sym) return
    const entry: WhaleTrade = {
      ...raw,
      _key: raw.tradeId ?? `${raw.ts}-${++_counter}`,
    }
    whales.value.unshift(entry)
    if (whales.value.length > MAX) whales.value.length = MAX
  }
  subscribe('whale_event', sym, currentCb)
}

onReady(() => mountSub(symbolStore.activeSymbol))
watch(() => symbolStore.activeSymbol, (sym) => { if (sym) mountSub(sym) })
onUnmounted(() => { if (currentCb) unsubscribe('whale_event', currentSymbol, currentCb) })

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K'
  return n.toFixed(0)
}
function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
</script>

<style scoped>
.whale-feed { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.feed-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-divider); flex-shrink: 0;
}
.feed-title { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; }
.feed-sym   { font-size: var(--text-xs); color: var(--color-primary); font-weight: 700; }
.feed-list  { flex: 1; overflow-y: auto; }
.whale-row  {
  display: grid;
  grid-template-columns: 50px 90px 1fr 70px 50px;
  padding: 3px var(--space-3);
  height: 26px;
  font-size: 11px;
  border-bottom: 1px solid oklch(from var(--color-border) l c h / 0.3);
  box-sizing: border-box;
}
.whale-side        { font-weight: 700; }
.whale-side.buy    { color: var(--color-success); }
.whale-side.sell   { color: var(--color-notification); }
.whale-pair, .whale-ex, .whale-time { color: var(--color-text-muted); }
.whale-qty  { color: var(--color-text); font-variant-numeric: tabular-nums; }
</style>
