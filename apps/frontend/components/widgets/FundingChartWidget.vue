<!-- apps/frontend/components/widgets/FundingChartWidget.vue -->
<template>
  <div class="widget-panel">
    <div class="panel-header">
      <span class="panel-title">Funding Rate</span>
      <div class="panel-sources">
        <button
          v-for="src in SOURCES"
          :key="src.id"
          :class="['src-btn', activeSrc === src.id ? 'active' : '']"
          @click="activeSrc = src.id; loadFunding()"
        >{{ src.label }}</button>
      </div>
      <span class="panel-sym">{{ symbolStore.activeSymbol }}</span>
    </div>
    <div v-if="loading" class="panel-loading">Loading…</div>
    <div v-if="error"   class="panel-error">{{ error }}</div>
    <div ref="chartEl" class="chart-area"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { createChart, type IChartApi, type ISeriesApi, HistogramSeries } from 'lightweight-charts'
import { useSymbolStore } from '~/stores/symbol.store'

const SOURCES = [
  { id: 'binance', label: 'Binance' },
  { id: 'bybit',   label: 'Bybit'   },
]

const symbolStore = useSymbolStore()
const chartEl   = ref<HTMLElement | null>(null)
const loading   = ref(false)
const error     = ref('')
const activeSrc = ref('binance')
let chart: IChartApi | null = null
let series: ISeriesApi<'Histogram'> | null = null
let timer: ReturnType<typeof setInterval> | null = null

function normSymbol(sym: string): string {
  return sym.replace('/', '')
}

async function loadBinance(sym: string): Promise<{ time: number; value: number }[]> {
  const s = normSymbol(sym).replace('USDT', '') + 'USDT'
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${s}&limit=100`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance ${res.status}`)
  const data: { fundingTime: number; fundingRate: string }[] = await res.json()
  return data.map(d => ({
    time:  Math.floor(d.fundingTime / 1000),
    value: parseFloat(d.fundingRate) * 100,
  }))
}

async function loadBybit(sym: string): Promise<{ time: number; value: number }[]> {
  const s = normSymbol(sym).replace('USDT', '') + 'USDT'
  const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${s}&limit=200`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bybit ${res.status}`)
  const json = await res.json()
  const list: { fundingRateTimestamp: string; fundingRate: string }[] = json?.result?.list ?? []
  return list
    .map(d => ({
      time:  Math.floor(Number(d.fundingRateTimestamp) / 1000),
      value: parseFloat(d.fundingRate) * 100,
    }))
    .sort((a, b) => a.time - b.time)
}

async function loadFunding() {
  if (!series) return
  loading.value = true
  error.value   = ''
  try {
    const sym    = symbolStore.activeSymbol
    const points = activeSrc.value === 'bybit'
      ? await loadBybit(sym)
      : await loadBinance(sym)

    if (!points.length) { error.value = 'No data'; return }

    const seen  = new Set<number>()
    const dedup = points.filter(p => { if (seen.has(p.time)) return false; seen.add(p.time); return true })
    dedup.sort((a, b) => a.time - b.time)

    series.setData(
      dedup.map(p => ({
        time:  p.time as unknown as import('lightweight-charts').Time,
        value: p.value,
        color: p.value >= 0 ? '#22c55e' : '#ef4444',
      }))
    )
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Fetch error'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!chartEl.value) return
  chart = createChart(chartEl.value, {
    layout: { background: { color: 'transparent' }, textColor: '#cdccca' },
    grid:   { vertLines: { color: '#262523' }, horzLines: { color: '#262523' } },
    autoSize: true,
  })
  series = chart.addSeries(HistogramSeries, { color: '#4f98a3' })
  loadFunding()
  timer = setInterval(loadFunding, 60_000)
})

watch(() => symbolStore.activeSymbol, () => loadFunding())

onUnmounted(() => {
  if (timer) clearInterval(timer)
  chart?.remove()
})
</script>

<style scoped>
.widget-panel  { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.panel-header  {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0; flex-wrap: wrap;
}
.panel-title   { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; }
.panel-sym     { font-size: var(--text-xs); color: var(--color-primary); font-weight: 700; margin-left: auto; }
.panel-sources { display: flex; gap: 3px; }
.src-btn {
  font-size: 10px; padding: 2px 6px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-interactive);
}
.src-btn:hover  { border-color: var(--color-primary); color: var(--color-primary); }
.src-btn.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.chart-area    { flex: 1; min-height: 0; }
.panel-loading { padding: 4px 12px; font-size: 10px; color: var(--color-text-faint); }
.panel-error   { padding: 4px 12px; font-size: 10px; color: #ef4444; }
</style>
