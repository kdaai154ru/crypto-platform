<!-- apps/frontend/components/widgets/HeatmapRsiWidget.vue -->
<template>
  <div class="h-full overflow-auto p-2">
    <div v-if="loading && cells.length===0" style="color:var(--color-text-faint);font-size:11px;padding:8px">Loading RSI…</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:3px">
      <div v-for="cell in cells" :key="cell.symbol"
           :style="`background:${rsiBackground(cell.rsi)};border-radius:4px;padding:5px 4px;text-align:center`">
        <div style="font-size:9px;color:rgba(255,255,255,0.7);margin-bottom:1px">{{ cell.symbol.replace('USDT','') }}</div>
        <div style="font-size:12px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums">
          {{ cell.rsi != null ? cell.rsi.toFixed(0) : '\u2014' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT',
  'MATICUSDT','LTCUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
]

const cells  = ref<{ symbol: string; rsi: number | null }[]>(
  SYMBOLS.map(s => ({ symbol: s, rsi: null }))
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
    return calcRsi(data.map(k => parseFloat(k[4])))
  } catch { return null }
}

async function loadAll() {
  loading.value = true
  await Promise.allSettled(SYMBOLS.map(async (sym, idx) => {
    const rsi = await fetchRsi1h(sym)
    cells.value[idx].rsi = rsi
  }))
  loading.value = false
}

function rsiBackground(v: number | null) {
  if (v == null) return 'var(--color-surface-offset)'
  if (v >= 70)   return 'rgba(248,113,113,0.75)'
  if (v <= 30)   return 'rgba(74,222,128,0.65)'
  const norm = (v - 30) / 40
  return `rgba(${Math.round(norm*248)}, ${Math.round((1-norm)*200+50)}, 100, 0.5)`
}

onMounted(() => {
  loadAll()
  timer = setInterval(loadAll, 60_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>
