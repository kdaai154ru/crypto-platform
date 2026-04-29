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
        :title="cell.symbol.replace('USDT','') + ': RSI=' + (cell.rsi?.toFixed(1) ?? '—')"
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

const DEFAULT_SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT',
  'MATICUSDT','LTCUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
  'FILUSDT','APTUSDT','INJUSDT','TIAUSDT','SUIUSDT',
]

const filterCat     = ref('All')
const customSymbols = ref<string[]>([])  // если заполнен — используем вместо авто
const showPicker    = ref(false)
const { allSymbols } = useSymbolSearch()

// Авто-список по категории (если customSymbols пуст)
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

// Wilder RSI (14)
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

async function fetchRsi1h(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`)
    if (!r.ok) return null
    const data: [number,string,string,string,string,...unknown[]][] = await r.json()
    const closes = data.map(k => parseFloat(k[4])).filter(v => isFinite(v))
    return calcRsi(closes)
  } catch { return null }
}

async function loadAll() {
  loading.value = true
  const syms = activeSymbols.value
  cells.value = syms.map(s => ({ symbol: s, rsi: null }))
  await Promise.allSettled(syms.map(async (sym, idx) => {
    const rsi = await fetchRsi1h(sym)
    if (cells.value[idx]) cells.value[idx].rsi = rsi
  }))
  loading.value = false
}

function setCategory(cat: string) {
  filterCat.value = cat
  customSymbols.value = []  // сбрасываем ручной выбор при смене категории
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
  return `rgba(${Math.round(norm*248)}, ${Math.round((1-norm)*200+50)}, 100, 0.5)`
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
  display: flex; align-items: center; gap: var(--space-2);
  padding: 4px var(--space-2); border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.hm-cats { display: flex; flex-wrap: wrap; gap: 3px; flex: 1; }
.hm-cat {
  font-size: 9px; padding: 1px 5px;
  border-radius: var(--radius-full); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-faint);
  cursor: pointer; transition: all var(--transition-interactive);
}
.hm-cat:hover  { border-color: var(--color-primary); color: var(--color-text-muted); }
.hm-cat.active { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-text-inverse); }
.sym-btn {
  font-size: 9px; padding: 2px 6px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
  transition: all var(--transition-interactive);
}
.sym-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn {
  font-size: 11px; padding: 2px 5px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
  transition: all var(--transition-interactive);
}
.refresh-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }
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
.hm-loading { font-size: 11px; color: var(--color-text-faint); padding: 8px; }
.hm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 3px; padding: var(--space-2);
  overflow-y: auto; flex: 1;
}
.hm-cell {
  border-radius: 4px; padding: 5px 4px;
  text-align: center; cursor: default;
  transition: transform var(--transition-interactive);
}
.hm-cell:hover { transform: scale(1.05); }
.hm-sym { font-size: 9px; color: rgba(255,255,255,0.7); margin-bottom: 1px; }
.hm-val { font-size: 12px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums; }
</style>
