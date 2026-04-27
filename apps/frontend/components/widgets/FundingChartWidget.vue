<!-- apps/frontend/components/widgets/FundingChartWidget.vue -->
<template>
  <div class="widget-panel">
    <div class="panel-header">
      <span class="panel-title">Funding Rate</span>
      <span class="panel-sym">{{ symbolStore.activeSymbol }}</span>
    </div>
    <div ref="chartEl" class="chart-area"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { createChart, type IChartApi, type ISeriesApi, HistogramSeries } from 'lightweight-charts'
import { useWsClient } from '~/composables/useWsClient'
import { useSymbolStore } from '~/stores/symbol.store'

const symbolStore = useSymbolStore()
const { subscribe, unsubscribe, onReady } = useWsClient()
const chartEl = ref<HTMLElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Histogram'> | null = null
let currentCb: ((d: unknown) => void) | null = null
let currentSymbol = ''

function mountSub(sym: string) {
  if (currentCb) { unsubscribe('deriv_fund', currentSymbol, currentCb); currentCb = null }
  currentSymbol = sym
  currentCb = (d: unknown) => {
    const p = d as { symbol?: string; ts: number; rate: number }
    if (p.symbol && p.symbol !== sym) return
    series?.update({
      time: Math.floor(p.ts / 1000) as unknown as import('lightweight-charts').Time,
      value: p.rate * 100,
      color: p.rate >= 0 ? '#22c55e' : '#ef4444',
    })
  }
  subscribe('deriv_fund', sym, currentCb)
}

onMounted(() => {
  if (!chartEl.value) return
  chart = createChart(chartEl.value, {
    layout: { background: { color: 'transparent' }, textColor: '#cdccca' },
    grid: { vertLines: { color: '#262523' }, horzLines: { color: '#262523' } },
    autoSize: true,
  })
  series = chart.addSeries(HistogramSeries, { color: '#4f98a3' })
  onReady(() => mountSub(symbolStore.activeSymbol))
})

watch(() => symbolStore.activeSymbol, (sym) => { if (sym && chart) mountSub(sym) })
onUnmounted(() => { if (currentCb) unsubscribe('deriv_fund', currentSymbol, currentCb); chart?.remove() })
</script>

<style scoped>
.widget-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-divider); flex-shrink: 0; }
.panel-title  { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; }
.panel-sym    { font-size: var(--text-xs); color: var(--color-primary); font-weight: 700; }
.chart-area   { flex: 1; }
</style>
