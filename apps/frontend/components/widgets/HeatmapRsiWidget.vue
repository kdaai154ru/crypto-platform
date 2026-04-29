<!-- apps/frontend/components/widgets/HeatmapRsiWidget.vue -->
<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- Хедер -->
    <div class="hm-header">
      <div class="hm-cats">
        <button
          v-for="cat in ['All','Memes','DeFi','L1','L2','AI','Gaming']" :key="cat"
          class="hm-cat" :class="{ active: filterCat === cat }"
          @click="setCategory(cat)"
        >{{ cat }}</button>
      </div>
      <!-- TF селектор -->
      <select v-model="activeTf" class="hm-tf" @change="loadAll">
        <option v-for="tf in TF_OPTIONS" :key="tf" :value="tf">{{ tf }}</option>
      </select>
      <!-- Кнопка выбора символов + Top-N -->
      <button class="sym-btn" @click="showPicker = !showPicker">⊞ ({{ customSymbols.length || 'auto' }})</button>
      <button class="refresh-btn" @click="loadAll" :disabled="loading">↻</button>
    </div>

    <!-- SymbolPicker dropdown -->
    <div v-if="showPicker" class="hm-picker">
      <SymbolPicker v-model="customSymbols" :show-top-n="true" />
      <button class="apply-btn" @click="applyPicker">Apply</button>
    </div>

    <div v-if="loading && cells.length===0" class="hm-loading">Loading RSI…</div>
    <div class="hm-grid">
      <div
        v-for="cell in cells" :key="cell.symbol"
        class="hm-cell"
        :style="{ background: rsiBackground(cell.rsi) }"
        :title="cell.symbol.replace('USDT','') + ': RSI=' + (cell.rsi?.toFixed(1) ?? '—') + ' (' + activeTf + ')'"
      >
        <div class="hm-sym">{{ cell.symbol.replace('USDT','') }}</div>
        <div class="hm-val">{{ cell.rsi != null ? cell.rsi.toFixed(0) : '—' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSymbolSearch, loadSymbols, CATEGORIES } from '~/composables/useSymbolSearch'
import SymbolPicker from '~/components/SymbolPicker.vue'

const TF_OPTIONS = ['5m','15m','30m','1h','4h','1d'] as const
type TF = typeof TF_OPTIONS[number]

const DEFAULT_SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT',
  'MATICUSDT','LTCUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
  'FILUSDT','APTUSDT','INJUSDT','TIAUSDT','SUIUSDT',
]

const filterCat     = ref('All')
const activeTf      = ref<TF>('1h')
const customSymbols = ref<string[]>([])
const showPicker    = ref(false)
const { allSymbols } = useSymbolSearch()

const autoSymbols = computed<string[]>(() => {
  if (filterCat.value === 'All') return DEFAULT_SYMBOLS
  const tags = CATEGORIES[filterCat.value] ?? []
  if (!tags.length) return DEFAULT_SYMBOLS
  const base = allSymbols.value.length > 0 ? allSymbols.value : DEFAULT_SYMBOLS
  return base
    .filter(s => tags.some(t => s.startsWith(t + 'USDT') || s === t + 'USDT'))
    .slice(0, 40)
})

const activeSymbols = computed<string[]>(() =>
  customSymbols.value.length > 0 ? customSymbols.value : autoSymbols.value
)

const cells  = ref<{ symbol: string; rsi: number | null }[]>(
  DEFAULT_SYMBOLS.map(s => ({ symbol: s, rsi: null }))
)
const loading = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

// Wilder RSI
function calcRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    d > 0 ? (gains += d) : (losses -= d)
  }
  let ag = gains / period, al = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period
  }
  if (al === 0) return 100
  return 100 - 100 / (1 + ag / al)
}

async function fetchRsi(symbol: string, tf: TF): Promise<number | null> {
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=100`)
    if (!r.ok) return null
    const data: [number,string,string,string,string,...unknown[]][] = await r.json()
    const closes = data.map(k => parseFloat(k[4])).filter(v => isFinite(v))
    return calcRsi(closes)
  } catch { return null }
}

async function loadAll() {
  loading.value = true
  const syms = activeSymbols.value
  const tf   = activeTf.value
  cells.value = syms.map(s => ({ symbol: s, rsi: null }))
  await Promise.allSettled(syms.map(async (sym, idx) => {
    const rsi = await fetchRsi(sym, tf)
    if (cells.value[idx]) cells.value[idx].rsi = rsi
  }))
  loading.value = false
}

function setCategory(cat: string) {
  filterCat.value = cat
  customSymbols.value = []
  loadAll()
}

function applyPicker() {
  showPicker.value = false
  loadAll()
}

function rsiBackground(v: number | null) {
  if (v == null) return 'var(--color-surface-offset)'
  if (v >= 70)   return 'rgba(248,113,113,0.75)'
  if (v <= 30)   return 'rgba(74,222,128,0.65)'
  const norm = (v - 30) / 40
  const r = Math.round(74  + (248 - 74)  * norm)
  const g = Math.round(222 + (113 - 222) * norm)
  const b = Math.round(128 + (113 - 128) * norm)
  return `rgba(${r},${g},${b},0.5)`
}

onMounted(() => {
  loadSymbols()
  loadAll()
  timer = setInterval(loadAll, 60_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.hm-header {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 4px 6px; border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.hm-cats { display: flex; gap: 3px; flex-wrap: wrap; }
.hm-cat {
  font-size: 9px; padding: 1px 5px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-faint);
  cursor: pointer; transition: all var(--transition-interactive);
}
.hm-cat:hover  { border-color: var(--color-primary); color: var(--color-text-muted); }
.hm-cat.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.hm-tf {
  font-size: 10px; padding: 1px 4px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
}
.sym-btn {
  font-size: 10px; padding: 2px 6px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
  transition: all var(--transition-interactive);
}
.sym-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.hm-picker {
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-surface);
  flex-shrink: 0; max-height: 280px; overflow-y: auto;
}
.apply-btn {
  width: 100%; font-size: 11px; padding: 4px;
  background: var(--color-primary); color: var(--color-text-inverse);
  border: none; cursor: pointer;
  transition: background var(--transition-interactive);
}
.apply-btn:hover { background: var(--color-primary-hover); }
.refresh-btn {
  margin-left: auto; font-size: 10px; padding: 2px 8px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
}
.refresh-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }
.hm-loading { padding: 8px; text-align: center; font-size: 10px; color: var(--color-text-faint); }
.hm-grid {
  display: flex; flex-wrap: wrap; gap: 3px;
  padding: 6px; overflow-y: auto; flex: 1;
  align-content: flex-start;
}
.hm-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 56px; height: 44px; border-radius: var(--radius-sm);
  cursor: default; transition: opacity 0.2s;
}
.hm-cell:hover { opacity: 0.85; }
.hm-sym { font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.9); line-height: 1; }
.hm-val { font-size: 12px; font-weight: 700; color: #fff; line-height: 1.2; font-variant-numeric: tabular-nums; }
</style>
