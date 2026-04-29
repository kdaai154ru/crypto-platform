<!-- apps/frontend/components/widgets/MarketOverviewWidget.vue -->
<template>
  <div class="mo-wrapper">
    <!-- Верхняя панель -->
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
      <button class="icon-btn" title="Add symbols" @click="openPicker">
        ⊞ {{ selectedSymbols.length }}
      </button>
      <button class="refresh-btn" @click="loadAll" :disabled="loading">↻</button>
    </div>

    <!-- Symbol Picker -->
    <div v-if="showPicker" class="mo-picker-wrap">
      <div v-if="pickerLoading" class="mo-picker-loading">
        <span class="mo-spinner" />
        Загрузка пар…
      </div>
      <template v-else>
        <!-- Search inside picker -->
        <div class="mo-picker-search-wrap">
          <input
            v-model="pickerQuery"
            class="mo-picker-search"
            placeholder="Поиск BTC, ETH…"
            @keydown.enter.prevent="addFirst"
          />
        </div>
        <!-- Category pills -->
        <div class="mo-picker-cats">
          <button
            v-for="cat in allCats" :key="cat"
            :class="['mo-cat', pickerCat === cat && 'active']"
            @click="pickerCat = cat"
          >{{ cat }}</button>
        </div>
        <!-- Results -->
        <div class="mo-picker-list">
          <button
            v-for="sym in pickerFiltered" :key="sym"
            :class="['mo-pick-item', isSelected(sym) && 'selected']"
            @click="toggleSym(sym)"
          >
            <span class="mo-pick-name">{{ formatSym(sym) }}</span>
            <svg v-if="isSelected(sym)" width="10" height="10" viewBox="0 0 12 12"
                 fill="none" stroke="var(--color-primary)" stroke-width="2">
              <polyline points="2 6 5 9 10 3"/>
            </svg>
          </button>
          <div v-if="!pickerFiltered.length" class="mo-pick-empty">Не найдено</div>
        </div>
      </template>
      <button class="apply-btn" @click="applySymbols">Apply ({{ selectedSymbols.length }})</button>
    </div>

    <!-- Tickers -->
    <div class="mo-tickers">
      <div v-if="tickers.length === 0" class="mo-empty">
        <span>Нажмите ⊞ чтобы добавить пары</span>
      </div>
      <div v-for="t in tickers" :key="t.symbol" class="ticker-card">
        <div class="tk-top">
          <span class="tk-sym">{{ formatSym(t.symbol) }}</span>
          <button class="tk-remove" title="Remove" @click="removeSymbol(t.symbol)">&#x2715;</button>
        </div>
        <span class="tk-price">{{ fmtPrice(t.last) }}</span>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { NormalizedTicker } from '@crypto-platform/types'
import { useWsClient } from '~/composables/useWsClient'
import { loadSymbols, allSymbols, CATEGORIES } from '~/composables/useSymbolSearch'

// ---- HELPERS ----
function normSymbol(s: string): string {
  // always store as BTCUSDT (no slash)
  return s.replace('/', '')
}
function formatSym(s: string): string {
  // display as BTC/USDT
  const n = normSymbol(s)
  return n.replace('USDT', '') + '/USDT'
}

// ---- DEFAULTS ----
const DEFAULT_SYMS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT']

// ---- STATE ----
const selectedSymbols  = ref<string[]>([...DEFAULT_SYMS])
const showPicker       = ref(false)
const pickerLoading    = ref(false)
const pickerQuery      = ref('')
const pickerCat        = ref('All')

const TF_OPTIONS = ['1m','3m','5m','15m','30m','1h','4h','8h','12h','1d','3d','1w'] as const
type TF = typeof TF_OPTIONS[number]

const volTf   = ref<TF>('1d')
const chgTf   = ref<TF>('1d')
const loading = ref(false)

// ---- TICKER ROWS ----
interface TickerRow {
  symbol: string  // BTCUSDT
  last: number
  change: number
  volume: number
}
const tickers = ref<TickerRow[]>(
  DEFAULT_SYMS.map(s => ({ symbol: s, last: 0, change: 0, volume: 0 }))
)

// ---- PICKER FILTERING ----
const allCats = computed(() => ['All', ...Object.keys(CATEGORIES)])

const pickerFiltered = computed(() => {
  let list = allSymbols.value.length > 0
    ? allSymbols.value
    : DEFAULT_SYMS

  // Category filter
  if (pickerCat.value !== 'All') {
    const tags = CATEGORIES[pickerCat.value] ?? []
    list = list.filter(s => {
      const base = s.replace('USDT', '')
      return tags.includes(base)
    })
  }

  // Text search
  const q = pickerQuery.value.trim().toUpperCase()
  if (q) {
    list = list.filter(s => s.includes(q) || s.replace('USDT', '').includes(q))
  }

  return list.slice(0, 150) // limit render to 150
})

function isSelected(sym: string): boolean {
  return selectedSymbols.value.includes(normSymbol(sym))
}

function toggleSym(sym: string) {
  const n = normSymbol(sym)
  const idx = selectedSymbols.value.indexOf(n)
  if (idx >= 0) {
    if (selectedSymbols.value.length > 1) selectedSymbols.value.splice(idx, 1)
  } else {
    if (selectedSymbols.value.length < 30) selectedSymbols.value.push(n)
  }
}

function addFirst() {
  if (pickerFiltered.value.length) toggleSym(pickerFiltered.value[0]!)
}

async function openPicker() {
  showPicker.value = !showPicker.value
  if (showPicker.value && allSymbols.value.length === 0) {
    pickerLoading.value = true
    await loadSymbols()
    pickerLoading.value = false
  }
}

function applySymbols() {
  showPicker.value = false
  // Sync tickers array with selectedSymbols
  tickers.value = selectedSymbols.value.map(s => {
    const existing = tickers.value.find(t => t.symbol === s)
    return existing ?? { symbol: s, last: 0, change: 0, volume: 0 }
  })
  mountWs()
  loadAll()
}

// ---- WS ----
const { subscribe, unsubscribe, onEveryReady } = useWsClient()
const handlers: { sym: string; cb: (d: unknown) => void }[] = []

function mountWs() {
  for (const { sym, cb } of handlers) unsubscribe('ticker', sym.replace('USDT', '/USDT'), cb)
  handlers.length = 0
  for (const sym of selectedSymbols.value) {
    const wsSym = sym.replace('USDT', '/USDT')
    const cb = (d: unknown) => {
      const t = d as NormalizedTicker
      const idx = tickers.value.findIndex(x => x.symbol === sym)
      if (idx >= 0) tickers.value[idx].last = t.last
    }
    subscribe('ticker', wsSym, cb)
    handlers.push({ sym, cb })
  }
}

// ---- REST METRICS ----
// Формула:
// change% = (close_last - close_first) / close_first * 100
//   close_first = open первой свечи (индекс 1)
//   close_last  = close последней закрытой свечи (индекс 4)
// volume = сумма quoteVolume (индекс 7) всех свечей, кроме текущей (незакрытая)

// TF → binance interval + количество свечей
const TF_MAP: Record<TF, { interval: string; limit: number }> = {
  '1m':  { interval: '1m',  limit: 1 },
  '3m':  { interval: '3m',  limit: 1 },
  '5m':  { interval: '5m',  limit: 1 },
  '15m': { interval: '15m', limit: 1 },
  '30m': { interval: '30m', limit: 1 },
  '1h':  { interval: '1h',  limit: 1 },
  '4h':  { interval: '4h',  limit: 1 },
  '8h':  { interval: '8h',  limit: 1 },
  '12h': { interval: '12h', limit: 1 },
  '1d':  { interval: '1d',  limit: 1 },
  '3d':  { interval: '1d',  limit: 3 },
  '1w':  { interval: '1d',  limit: 7 },
}

async function fetchKlines(
  symbol: string, interval: string, limit: number
): Promise<[number,string,string,string,string,string,number,string,...unknown[]][]> {
  const r = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit + 1}`
  )
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

async function calcMetrics(sym: string, vTf: TF, cTf: TF) {
  const { interval: intV, limit: limV } = TF_MAP[vTf]
  const { interval: intC, limit: limC } = TF_MAP[cTf]

  const sameInterval = intV === intC

  const [kvData, kcDataRaw] = await Promise.all([
    fetchKlines(sym, intV, limV),
    sameInterval ? Promise.resolve(null) : fetchKlines(sym, intC, limC),
  ])

  // volume: sum of quoteAssetVolume [7] for all CLOSED candles
  // Binance returns limit+1 candles, last one is unclosed — skip it
  const kvClosed = kvData.slice(0, -1).slice(-limV)
  const volume = kvClosed.reduce((acc, k) => acc + parseFloat(k[7] as string), 0)

  // change%: open of first closed candle -> close of last closed candle
  const kcUse = (kcDataRaw ?? kvData).slice(0, -1).slice(-limC)
  let change = 0
  if (kcUse.length > 0) {
    const openFirst  = parseFloat(kcUse[0]![1] as string)   // open  [1]
    const closeLast  = parseFloat(kcUse[kcUse.length - 1]![4] as string) // close [4]
    change = openFirst !== 0 ? (closeLast - openFirst) / openFirst * 100 : 0
  }

  return { volume, change }
}

async function loadAll() {
  loading.value = true
  await Promise.allSettled(
    selectedSymbols.value.map(async (sym, i) => {
      try {
        const { volume, change } = await calcMetrics(sym, volTf.value, chgTf.value)
        const idx = tickers.value.findIndex(t => t.symbol === sym)
        if (idx >= 0) {
          tickers.value[idx].volume = volume
          tickers.value[idx].change = change
        }
      } catch { /* ignore per-symbol errors */ }
    })
  )
  loading.value = false
}

function removeSymbol(sym: string) {
  selectedSymbols.value = selectedSymbols.value.filter(s => s !== sym)
  tickers.value = tickers.value.filter(t => t.symbol !== sym)
  const handler = handlers.find(h => h.sym === sym)
  if (handler) {
    unsubscribe('ticker', sym.replace('USDT', '/USDT'), handler.cb)
    handlers.splice(handlers.indexOf(handler), 1)
  }
}

// ---- FORMATTERS ----
function fmtPrice(n: number): string {
  if (!n) return '—'
  if (n >= 10000)  return n.toLocaleString('en', { maximumFractionDigits: 0 })
  if (n >= 1000)   return n.toLocaleString('en', { maximumFractionDigits: 1 })
  if (n >= 1)      return n.toFixed(4)
  if (n >= 0.0001) return n.toPrecision(5)
  return n.toExponential(3)
}

function fmtVol(n: number): string {
  if (!n) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

let restTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadSymbols()  // preload in bg
  loadAll()
  restTimer = setInterval(loadAll, 60_000)
})
onEveryReady(mountWs)
onUnmounted(() => {
  for (const { sym, cb } of handlers) unsubscribe('ticker', sym.replace('USDT', '/USDT'), cb)
  if (restTimer) clearInterval(restTimer)
})
</script>

<style scoped>
.mo-wrapper { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.mo-controls {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 4px var(--space-3); border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.tf-group   { display: flex; align-items: center; gap: 4px; }
.tf-label   { font-size: 10px; color: var(--color-text-faint); }
.tf-select  {
  font-size: 10px; padding: 1px 4px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
}
.icon-btn, .refresh-btn {
  font-size: 12px; padding: 2px 8px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
  transition: all var(--transition-interactive);
}
.icon-btn { margin-left: auto; }
.icon-btn:hover, .refresh-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }

/* Picker */
.mo-picker-wrap {
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-surface);
  flex-shrink: 0;
  max-height: 340px;
  display: flex;
  flex-direction: column;
}
.mo-picker-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 12px; font-size: 11px; color: var(--color-text-faint);
}
.mo-spinner {
  width: 14px; height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: mo-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes mo-spin { to { transform: rotate(360deg); } }

.mo-picker-search-wrap { padding: 6px 8px 2px; flex-shrink: 0; }
.mo-picker-search {
  width: 100%; padding: 5px 8px;
  background: var(--color-surface-offset); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); color: var(--color-text); font-size: 12px; outline: none;
}
.mo-picker-search:focus { border-color: var(--color-primary); }

.mo-picker-cats {
  display: flex; gap: 2px; padding: 4px 8px;
  flex-wrap: wrap; flex-shrink: 0;
  border-bottom: 1px solid var(--color-divider);
}
.mo-cat {
  padding: 2px 7px; border-radius: 9999px; font-size: 10px; color: var(--color-text-muted);
  cursor: pointer; border: 1px solid transparent; background: transparent;
  transition: all 100ms; white-space: nowrap;
}
.mo-cat:hover  { color: var(--color-text); background: var(--color-surface-offset); }
.mo-cat.active { color: var(--color-primary); border-color: var(--color-primary); background: var(--color-primary-highlight); }

.mo-picker-list { flex: 1; overflow-y: auto; padding: 4px 0; min-height: 0; }
.mo-pick-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 5px 12px; font-size: 12px; color: var(--color-text-muted);
  cursor: pointer; background: transparent; border: none; text-align: left;
  transition: background 80ms, color 80ms;
}
.mo-pick-item:hover, .mo-pick-item.selected { background: var(--color-surface-offset); }
.mo-pick-item.selected { color: var(--color-primary); font-weight: 600; }
.mo-pick-name { font-variant-numeric: tabular-nums; }
.mo-pick-empty { padding: 12px; text-align: center; color: var(--color-text-faint); font-size: 12px; }

.apply-btn {
  flex-shrink: 0; width: 100%; font-size: 11px; padding: 5px;
  background: var(--color-primary); color: var(--color-text-inverse);
  border: none; cursor: pointer; transition: background var(--transition-interactive);
}
.apply-btn:hover { background: var(--color-primary-hover); }

/* Tickers */
.mo-tickers {
  display: flex; align-items: flex-start; gap: var(--space-3);
  padding: 6px var(--space-3);
  overflow-x: auto; flex: 1;
}
.mo-empty {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
  font-size: 11px; color: var(--color-text-faint);
}
.ticker-card {
  display: flex; flex-direction: column; gap: 2px;
  min-width: 90px; flex-shrink: 0;
}
.tk-top   { display: flex; align-items: center; justify-content: space-between; }
.tk-sym   { font-size: 10px; color: var(--color-text-muted); font-weight: 600; }
.tk-remove {
  font-size: 9px; color: var(--color-text-faint); cursor: pointer; padding: 0 2px;
  background: none; border: none;
  transition: color var(--transition-interactive);
}
.tk-remove:hover { color: var(--color-error); }
.tk-price {
  font-size: 14px; font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}
.tk-metrics { display: flex; flex-direction: column; gap: 1px; }
.tk-metric  { display: flex; align-items: center; gap: 4px; font-size: 10px; }
.tk-metric-label { color: var(--color-text-faint); font-size: 9px; }
.tk-vol   { font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
.pos { color: var(--color-success); font-weight: 600; }
.neg { color: var(--color-error);   font-weight: 600; }
</style>
