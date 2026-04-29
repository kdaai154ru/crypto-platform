<!-- apps/frontend/components/widgets/MarketOverviewWidget.vue -->
<template>
  <div class="mo-wrapper">
    <!-- Таймфрейм-селекторы -->
    <div class="mo-controls">
      <div class="tf-group">
        <span class="tf-label">Vol</span>
        <select v-model="volTf" class="tf-select" @change="loadAll">
          <option v-for="tf in TF_OPTIONS" :key="tf" :value="tf">{{ tf }}</option>
        </select>
      </div>
      <div class="tf-group">
        <span class="tf-label">Chg</span>
        <select v-model="chgTf" class="tf-select" @change="loadAll">
          <option v-for="tf in TF_OPTIONS" :key="tf" :value="tf">{{ tf }}</option>
        </select>
      </div>
      <button class="refresh-btn" @click="loadAll" :disabled="loading">↻</button>
    </div>

    <!-- Тикеры -->
    <div class="mo-tickers">
      <div v-for="t in tickers" :key="t.symbol" class="ticker-card">
        <span class="tk-sym">{{ t.symbol.replace('/USDT', '') }}</span>
        <span class="tk-price">${{ fmtPrice(t.last) }}</span>
        <div class="tk-metrics">
          <span class="tk-metric">
            <span class="tk-metric-label">{{ chgTf }}</span>
            <span :class="t.change >= 0 ? 'pos' : 'neg'">
              {{ t.change >= 0 ? '+' : '' }}{{ t.change.toFixed(2) }}%
            </span>
          </span>
          <span class="tk-metric">
            <span class="tk-metric-label">Vol {{ volTf }}</span>
            <span class="tk-vol">{{ fmtVol(t.volume) }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { NormalizedTicker } from '@crypto-platform/types'
import { useWsClient } from '~/composables/useWsClient'

const DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']

const TF_OPTIONS = ['1m','3m','5m','15m','30m','1h','4h','8h','12h','1d','3d','1w'] as const
type TF = typeof TF_OPTIONS[number]

// Маппинг таймфрейма в миллисекунды (для вычисления кол-ва свечей)
const TF_MS: Record<TF, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '8h': 28_800_000, '12h': 43_200_000,
  '1d': 86_400_000, '3d': 259_200_000, '1w': 604_800_000,
}
// Количество свечей для покрытия таймфрейма
const TF_CANDLES: Record<TF, number> = {
  '1m': 1, '3m': 1, '5m': 1, '15m': 1, '30m': 1,
  '1h': 1, '4h': 1, '8h': 1, '12h': 1, '1d': 1, '3d': 3, '1w': 7,
}
// Базовый интервал для загрузки данных
const TF_BASE: Record<TF, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '8h': '8h', '12h': '12h', '1d': '1d', '3d': '1d', '1w': '1d',
}

interface TickerRow {
  symbol: string
  last: number
  change: number   // % за chgTf
  volume: number   // USD за volTf
}

const volTf   = ref<TF>('1d')
const chgTf   = ref<TF>('1d')
const tickers = ref<TickerRow[]>(DEFAULT_SYMBOLS.map(s => ({ symbol: s, last: 0, change: 0, volume: 0 })))
const loading = ref(false)

// WS — для live цены
const { subscribe, unsubscribe, onEveryReady } = useWsClient()
const handlers: { sym: string; cb: (d: unknown) => void }[] = []

function mountWs() {
  for (const { sym, cb } of handlers) unsubscribe('ticker', sym, cb)
  handlers.length = 0
  for (const sym of DEFAULT_SYMBOLS) {
    const cb = (d: unknown) => {
      const t = d as NormalizedTicker
      if (t.symbol !== sym) return
      const idx = tickers.value.findIndex(x => x.symbol === sym)
      if (idx >= 0) tickers.value[idx].last = t.last
    }
    subscribe('ticker', sym, cb)
    handlers.push({ sym, cb })
  }
}

// REST — для объёма и % зменения по выбранным TF
async function fetchKlines(
  symbol: string, interval: string, limit: number
): Promise<[number, string, string, string, string, string, ...unknown[]][]> {
  const s = symbol.replace('/', '')
  const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}&limit=${limit + 1}`)
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

async function calcMetrics(sym: string, vTf: TF, cTf: TF) {
  const limV = TF_CANDLES[vTf]
  const limC = TF_CANDLES[cTf]
  const limit = Math.max(limV, limC) + 1
  const intV  = TF_BASE[vTf]
  const intC  = TF_BASE[cTf]

  // Загружаем два интервала параллельно если они разные
  const [kvData, kcData] = await Promise.all([
    fetchKlines(sym, intV, limV),
    intV === intC ? Promise.resolve(null) : fetchKlines(sym, intC, limC),
  ])
  const kvUse = kvData.slice(-limV - 1)
  const kcUse = (kcData ?? kvData).slice(-limC - 1)

  // Объём: сумма quoteVolume за limV свечей (USD)
  const volume = kvUse.slice(0, limV).reduce((acc, k) => acc + parseFloat(k[7] as string), 0)

  // Изменение: (close_last - close_N_ago) / close_N_ago * 100
  const closeNow  = parseFloat(kcUse[kcUse.length - 1][4])
  const closeOld  = parseFloat(kcUse[0][1])  // open первой свечи = old close
  const change    = closeOld !== 0 ? (closeNow - closeOld) / closeOld * 100 : 0

  return { volume, change }
}

async function loadAll() {
  loading.value = true
  await Promise.allSettled(
    DEFAULT_SYMBOLS.map(async (sym, i) => {
      try {
        const { volume, change } = await calcMetrics(sym, volTf.value, chgTf.value)
        tickers.value[i].volume = volume
        tickers.value[i].change = change
      } catch { /* игнорируем */ }
    })
  )
  loading.value = false
}

function fmtPrice(n: number): string {
  if (!n) return '—'
  return n >= 1000 ? n.toLocaleString('en', { maximumFractionDigits: 2 }) : n.toPrecision(6)
}
function fmtVol(n: number): string {
  if (!n) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toFixed(0)
}

let restTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadAll()
  restTimer = setInterval(loadAll, 60_000)
})
onEveryReady(mountWs)
onUnmounted(() => {
  for (const { sym, cb } of handlers) unsubscribe('ticker', sym, cb)
  if (restTimer) clearInterval(restTimer)
})
</script>

<style scoped>
.mo-wrapper { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* Controls */
.mo-controls {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 4px var(--space-3); border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.tf-group   { display: flex; align-items: center; gap: 4px; }
.tf-label   { font-size: 10px; color: var(--color-text-faint); }
.tf-select  {
  font-size: 10px; padding: 1px 4px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted); cursor: pointer;
}
.refresh-btn {
  margin-left: auto; font-size: 12px; padding: 2px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted); cursor: pointer;
  transition: all var(--transition-interactive);
}
.refresh-btn:hover    { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }

/* Tickers */
.mo-tickers {
  display: flex; align-items: center; gap: var(--space-4);
  padding: 6px var(--space-3);
  overflow-x: auto; flex: 1;
}
.ticker-card {
  display: flex; flex-direction: column; gap: 2px;
  min-width: 90px; flex-shrink: 0;
}
.tk-sym     { font-size: 10px; color: var(--color-text-muted); font-weight: 600; }
.tk-price   { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-text); }
.tk-metrics { display: flex; flex-direction: column; gap: 1px; }
.tk-metric  { display: flex; align-items: center; gap: 4px; font-size: 10px; }
.tk-metric-label { color: var(--color-text-faint); font-size: 9px; }
.tk-vol     { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.pos { color: #22c55e; font-weight: 600; }
.neg { color: #ef4444; font-weight: 600; }
</style>
