<!-- apps/frontend/components/widgets/OIChartWidget.vue -->
<template>
  <div class="widget-panel">
    <div class="panel-header">
      <span class="panel-title">Open Interest</span>
      <span class="panel-sym">{{ symbolStore.activeSymbol }}</span>
    </div>
    <div ref="chartEl" class="chart-area"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { createChart, type IChartApi, type ISeriesApi, AreaSeries } from 'lightweight-charts'
import { useWsClient } from '~/composables/useWsClient'
import { useSymbolStore } from '~/stores/symbol.store'

const symbolStore = useSymbolStore()
const { subscribe, unsubscribe, connected } = useWsClient()
const chartEl = ref<HTMLElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Area'> | null = null
let currentCb: ((d: unknown) => void) | null = null
let currentSymbol = ''

function mountSub(sym: string) {
  if (currentCb) unsubscribe('oi_update', currentSymbol, currentCb)
  currentSymbol = sym
  currentCb = (d: unknown) => {
    const p = d as { symbol?: string; ts: number; oi: number }
    if (p.symbol && p.symbol !== sym) return
    series?.update({ time: Math.floor(p.ts / 1000) as unknown as import('lightweight-charts').Time, value: p.oi })
  }
  subscribe('oi_update', sym, currentCb)
}

onMounted(() => {
  if (!chartEl.value) return
  chart = createChart(chartEl.value, {
    layout: { background: { color: 'transparent' }, textColor: '#cdccca' },
    grid: { vertLines: { color: '#262523' }, horzLines: { color: '#262523' } },
    autoSize: true,
  })
  series = chart.addSeries(AreaSeries, {
    lineColor: '#4f98a3', topColor: 'rgba(79,152,163,0.3)', bottomColor: 'rgba(79,152,163,0)',
  })
  if (connected.value) mountSub(symbolStore.activeSymbol)
})

watch(() => symbolStore.activeSymbol, (sym) => { if (sym && connected.value) mountSub(sym) })
watch(connected, (v) => {
  if (v) mountSub(symbolStore.activeSymbol)
  else { if (currentCb) unsubscribe('oi_update', currentSymbol, currentCb); currentCb = null }
})
onUnmounted(() => { if (currentCb) unsubscribe('oi_update', currentSymbol, currentCb); chart?.remove() })
</script>

<style scoped>
.widget-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-divider); flex-shrink: 0; }
.panel-title  { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; }
.panel-sym    { font-size: var(--text-xs); color: var(--color-primary); font-weight: 700; }
.chart-area   { flex: 1; }
</style>
