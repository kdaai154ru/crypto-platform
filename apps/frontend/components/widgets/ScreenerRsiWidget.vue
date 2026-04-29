<!-- apps/frontend/components/widgets/ScreenerRsiWidget.vue -->
<template>
  <div class="h-full overflow-auto px-2 py-1">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--color-text-muted)">RSI Screener</span>
      <span v-if="loading" style="font-size:10px;color:var(--color-text-faint)">Loading…</span>
      <span v-if="error"   style="font-size:10px;color:#ef4444">{{ error }}</span>
      <!-- MACD toggle -->
      <label class="macd-toggle">
        <input type="checkbox" v-model="showMacd" />
        <span>MACD</span>
      </label>
      <button class="refresh-btn" @click="loadAll" :disabled="loading">↻ Refresh</button>
    </div>
    <table class="w-full text-xs screener-table">
      <thead>
        <tr class="text-muted border-b border-border">
          <th class="text-left pb-1 sortable" :class="sortKey==='symbol'?'sorted':''" @click="setSort('symbol')">
            Symbol <span class="sort-arrow">{{ sortKey==='symbol'?(sortDir==='asc'?'▲':'▼'):'⇅' }}</span>
          </th>
          <th v-for="tf in tfs" :key="tf"
              class="text-center pb-1 sortable" :class="sortKey===tf?'sorted':''"
              @click="setSort(tf)">
            RSI {{ tf }} <span class="sort-arrow">{{ sortKey===tf?(sortDir==='asc'?'▲':'▼'):'⇅' }}</span>
          </th>
          <!-- MACD columns per TF -->
          <template v-if="showMacd">
            <th v-for="tf in tfs" :key="'macd-'+tf"
                class="text-center pb-1 sortable" :class="sortKey==='macd_'+tf?'sorted':''"
                @click="setSort('macd_'+tf)">
              MACD {{ tf }} <span class="sort-arrow">{{ sortKey==='macd_'+tf?(sortDir==='asc'?'▲':'▼'):'⇅' }}</span>
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sortedRows" :key="row.symbol"
            class="border-t hover:bg-surface-offset">
          <td class="py-1 font-medium">{{ row.symbol.replace('USDT','') }}</td>
          <td v-for="tf in tfs" :key="tf" class="text-center">
            <span v-if="row[tf]!=null" :class="rsiColor(row[tf])" class="px-1 py-0.5 rounded text-[10px]">
              {{ row[tf].toFixed(1) }}
            </span>
            <span v-else style="color:var(--color-text-faint)">—</span>
          </td>
          <template v-if="showMacd">
            <td v-for="tf in tfs" :key="'macd-'+tf" class="text-center">
              <span v-if="row['macd_'+tf]!=null"
                    :class="row['macd_'+tf] >= 0 ? 'macd-bull' : 'macd-bear'"
                    class="px-1 py-0.5 rounded text-[10px]">
                {{ row['macd_'+tf].toFixed(2) }}
              </span>
              <span v-else style="color:var(--color-text-faint)">—</span>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT',
]
const tfs = ['5m','15m','1h','4h','1d'] as const
type TF = typeof tfs[number]

type RowData = { symbol: string } & Partial<Record<TF, number>> & Partial<Record<string, number>>

const rows    = ref<Map<string, Partial<Record<string, number>>>>(new Map())
const loading = ref(false)
const error   = ref('')
const sortKey = ref<string>('symbol')
const sortDir = ref<'asc'|'desc'>('asc')
const showMacd = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

// Точный Wilder RSI
function calcRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains  += diff
    else          losses -= diff
  }
  let avgGain = gains  / period
  let avgLoss = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

// EMA helper
function calcEma(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const ema: number[] = []
  let prev = values[0]
  ema.push(prev)
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    ema.push(prev)
  }
  return ema
}

// MACD histogram = MACD line - Signal line
// Returns latest histogram value (positive = bullish, negative = bearish)
function calcMacdHist(closes: number[], fast = 12, slow = 26, signal = 9): number | null {
  if (closes.length < slow + signal) return null
  const emaFast = calcEma(closes, fast)
  const emaSlow = calcEma(closes, slow)
  // MACD line (align to slow length)
  const offset = slow - fast
  const macdLine: number[] = []
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i])
  }
  if (macdLine.length < signal) return null
  const signalLine = calcEma(macdLine, signal)
  const last = macdLine.length - 1
  return macdLine[last] - signalLine[last]
}

async function fetchRsiMacd(symbol: string, tf: TF): Promise<{ rsi: number | null; macd: number | null }> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=100`
    const res  = await fetch(url)
    if (!res.ok) return { rsi: null, macd: null }
    const data: [number,string,string,string,string,...unknown[]][] = await res.json()
    const closes = data.map(k => parseFloat(k[4]))
    return {
      rsi:  calcRsi(closes),
      macd: calcMacdHist(closes),
    }
  } catch { return { rsi: null, macd: null } }
}

async function loadAll() {
  loading.value = true
  error.value   = ''
  try {
    const tasks = SYMBOLS.flatMap(sym =>
      tfs.map(async tf => {
        const { rsi, macd } = await fetchRsiMacd(sym, tf)
        if (!rows.value.has(sym)) rows.value.set(sym, {})
        const r = rows.value.get(sym)!
        if (rsi  !== null) r[tf]          = rsi
        if (macd !== null) r['macd_' + tf] = macd
      })
    )
    await Promise.allSettled(tasks)
    rows.value = new Map(rows.value)
  } catch (e) {
    error.value = 'Fetch error'
  } finally {
    loading.value = false
  }
}

const tableRows = computed((): RowData[] =>
  [...rows.value.entries()].map(([symbol, r]) => ({ symbol, ...r } as RowData))
)
const sortedRows = computed(() => {
  const arr = [...tableRows.value]
  const dir = sortDir.value === 'asc' ? 1 : -1
  arr.sort((a, b) => {
    if (sortKey.value === 'symbol') return a.symbol.localeCompare(b.symbol) * dir
    const av = (a as Record<string, number | undefined>)[sortKey.value]
    const bv = (b as Record<string, number | undefined>)[sortKey.value]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return (av - bv) * dir
  })
  return arr
})

function setSort(key: string) {
  sortKey.value === key
    ? (sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc')
    : (sortKey.value = key, sortDir.value = key === 'symbol' ? 'asc' : 'desc')
}

const rsiColor = (v: number) =>
  v >= 70 ? 'overbought' :
  v <= 30 ? 'oversold'   :
  'neutral'

onMounted(() => {
  loadAll()
  timer = setInterval(loadAll, 60_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.screener-table th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
.screener-table th.sortable:hover { color: var(--color-text); }
.screener-table th.sorted         { color: var(--color-primary); }
.sort-arrow  { font-size: 9px; margin-left: 2px; opacity: 0.6; }
.overbought  { background: rgba(239,68,68,0.15);  color: #f87171; padding: 1px 4px; border-radius: 3px; }
.oversold    { background: rgba(34,197,94,0.15);  color: #4ade80; padding: 1px 4px; border-radius: 3px; }
.neutral     { color: var(--color-text-muted); }
.macd-bull   { background: rgba(34,197,94,0.12);  color: #4ade80; padding: 1px 4px; border-radius: 3px; }
.macd-bear   { background: rgba(239,68,68,0.12);  color: #f87171; padding: 1px 4px; border-radius: 3px; }
.macd-toggle {
  display: flex; align-items: center; gap: 4px;
  font-size: 10px; color: var(--color-text-muted);
  cursor: pointer; user-select: none;
}
.macd-toggle input { accent-color: var(--color-primary); cursor: pointer; }
.refresh-btn {
  margin-left: auto; font-size: 10px; padding: 2px 8px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
}
.refresh-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }
</style>
