<!-- apps/frontend/components/widgets/ChartWidget.vue -->
<template>
  <div ref="chartEl" class="w-full h-full"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries } from 'lightweight-charts'
import { useWsClient } from '~/composables/useWsClient'
import { useSymbolStore } from '~/stores/symbol.store'
import type { NormalizedCandle } from '@crypto-platform/types'

const symbolStore = useSymbolStore()
const chartEl = ref<HTMLElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Candlestick'> | null = null

const { subscribe, unsubscribe, connected } = useWsClient()
let currentCb: ((d: unknown) => void) | null = null
let currentSymbol = ''

function mountSub(sym: string) {
  if (currentCb) unsubscribe('candle', currentSymbol, currentCb)
  currentSymbol = sym
  currentCb = (d: unknown) => {
    const c = d as NormalizedCandle & { symbol?: string }
    if (c.symbol && c.symbol !== sym) return
    series?.update({
      time: Math.floor(c.ts / 1000) as unknown as import('lightweight-charts').Time,
      open: c.open, high: c.high, low: c.low, close: c.close,
    })
  }
  subscribe('candle', sym, currentCb)
}

onMounted(() => {
  if (!chartEl.value) return
  chart = createChart(chartEl.value, {
    layout: { background: { color: 'transparent' }, textColor: '#cdccca' },
    grid: { vertLines: { color: '#262523' }, horzLines: { color: '#262523' } },
    autoSize: true,
  })
  series = chart.addSeries(CandlestickSeries, {
    upColor: '#22c55e', downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#22c55e', wickDownColor: '#ef4444',
  })
  if (connected.value) mountSub(symbolStore.activeSymbol)
})

watch(() => symbolStore.activeSymbol, (sym) => {
  if (sym && connected.value) mountSub(sym)
})

watch(connected, (v) => {
  if (v) mountSub(symbolStore.activeSymbol)
  else { if (currentCb) unsubscribe('candle', currentSymbol, currentCb); currentCb = null }
})

onUnmounted(() => {
  if (currentCb) unsubscribe('candle', currentSymbol, currentCb)
  chart?.remove()
})
</script>
