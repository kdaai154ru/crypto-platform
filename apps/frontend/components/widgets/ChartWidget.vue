<!-- apps/frontend/components/widgets/ChartWidget.vue -->
<template>
  <div class="chart-wrapper">
    <div class="chart-toolbar">
      <div class="tf-buttons">
        <button
          v-for="tf in TIMEFRAMES"
          :key="tf"
          :class="['tf-btn', activeTf === tf ? 'active' : '']"
          @click="changeTf(tf)"
        >{{ tf }}</button>
      </div>
      <span class="chart-sym">{{ symbolStore.activeSymbol }}</span>
    </div>
    <div ref="chartEl" class="chart-area"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries } from 'lightweight-charts'
import { useWsClient } from '~/composables/useWsClient'
import { useSymbolStore } from '~/stores/symbol.store'
import type { NormalizedCandle } from '@crypto-platform/types'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
type TF = typeof TIMEFRAMES[number]

// Binance tf alias map
const BINANCE_TF: Record<TF, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d'
}

const symbolStore = useSymbolStore()
const { activeSymbol } = storeToRefs(symbolStore)
const { subscribe, unsubscribe, onReady } = useWsClient()

const chartEl  = ref<HTMLElement | null>(null)
const activeTf = ref<TF>('1m')
let chart: IChartApi | null = null
let series: ISeriesApi<'Candlestick'> | null = null
let currentCb: ((d: unknown) => void) | null = null
let currentSymbol = ''
let currentTf: TF = '1m'

// Загрузка истории через Binance REST
async function loadHistory(sym: string, tf: TF): Promise<void> {
  if (!series) return
  try {
    const binanceSym = sym.replace('/', '')  // 'BTC/USDT' -> 'BTCUSDT'
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${BINANCE_TF[tf]}&limit=500`
    const res  = await fetch(url)
    if (!res.ok) return
    const raw: [number, string, string, string, string, ...unknown[]][] = await res.json()
    const candles = raw.map(k => ({
      time: Math.floor(k[0] / 1000) as unknown as import('lightweight-charts').Time,
      open:  parseFloat(k[1]),
      high:  parseFloat(k[2]),
      low:   parseFloat(k[3]),
      close: parseFloat(k[4]),
    }))
    series.setData(candles)
  } catch {
    // сеть недоступна — продолжаем без истории
  }
}

function mountSub(sym: string, tf: TF) {
  if (currentCb) { unsubscribe('candle', currentSymbol, currentCb); currentCb = null }
  currentSymbol = sym
  currentTf     = tf

  // 1. Сначала загружаем историю, потом подписываемся на live
  loadHistory(sym, tf).then(() => {
    currentCb = (d: unknown) => {
      const c = d as NormalizedCandle & { symbol?: string; tf?: string }
      if (c.symbol && c.symbol !== sym) return
      if (c.tf     && c.tf     !== tf)  return
      series?.update({
        time:  Math.floor(c.ts / 1000) as unknown as import('lightweight-charts').Time,
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      })
    }
    subscribe('candle', sym, currentCb)
  })
}

function changeTf(tf: TF) {
  activeTf.value = tf
  if (chart) mountSub(activeSymbol.value, tf)
}

onMounted(() => {
  if (!chartEl.value) return
  chart = createChart(chartEl.value, {
    layout: { background: { color: 'transparent' }, textColor: '#cdccca' },
    grid:   { vertLines: { color: '#262523' }, horzLines: { color: '#262523' } },
    autoSize: true,
  })
  series = chart.addSeries(CandlestickSeries, {
    upColor:      '#22c55e',
    downColor:    '#ef4444',
    borderVisible: false,
    wickUpColor:  '#22c55e',
    wickDownColor:'#ef4444',
  })
  onReady(() => mountSub(activeSymbol.value, activeTf.value))
})

watch(activeSymbol, (sym) => { if (sym && chart) mountSub(sym, activeTf.value) })

onUnmounted(() => {
  if (currentCb) unsubscribe('candle', currentSymbol, currentCb)
  chart?.remove()
})
</script>

<style scoped>
.chart-wrapper  { display: flex; flex-direction: column; height: 100%; }
.chart-toolbar  {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.tf-buttons { display: flex; gap: 3px; }
.tf-btn {
  font-size: 11px; padding: 2px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-interactive);
}
.tf-btn:hover  { border-color: var(--color-primary); color: var(--color-primary); }
.tf-btn.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.chart-sym  { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--color-primary); }
.chart-area { flex: 1; min-height: 0; }
</style>
