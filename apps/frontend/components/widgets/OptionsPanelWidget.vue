<!-- apps/frontend/components/widgets/OptionsPanelWidget.vue -->
<template>
  <div class="opts-widget">
    <div class="opts-header">
      <span class="opts-title">Options Analytics</span>
      <div class="opts-coins">
        <button
          v-for="c in COINS"
          :key="c"
          :class="['coin-btn', activeCoin === c ? 'active' : '']"
          @click="activeCoin = c; load()"
        >{{ c }}</button>
      </div>
      <button class="refresh-btn" @click="load" :disabled="loading">↻</button>
    </div>

    <div v-if="loading && !data" class="opts-empty">Loading…</div>
    <div v-else-if="error" class="opts-error">{{ error }}</div>

    <template v-else-if="data">
      <div class="opts-stats">
        <div class="stat-item">
          <span class="stat-label">Put/Call OI</span>
          <span class="stat-val" :style="{ color: data.pcr >= 1 ? '#ef4444' : '#22c55e' }">
            {{ data.pcr.toFixed(3) }}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Max Pain</span>
          <span class="stat-val">${{ data.maxPain.toLocaleString() }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total OI</span>
          <span class="stat-val">${{ fmtNum(data.totalOiUsd) }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Avg IV</span>
          <span class="stat-val">{{ (data.avgIv * 100).toFixed(1) }}%</span>
        </div>
      </div>

      <!-- Страйки -->
      <div class="opts-strikes">
        <div class="strikes-hdr">
          <span>Strike</span>
          <span style="text-align:right">Call OI</span>
          <span style="text-align:right">Put OI</span>
          <span style="text-align:right">IV%</span>
        </div>
        <div v-for="row in topStrikes" :key="row.strike" class="strike-row">
          <span :class="row.strike === data.maxPain ? 'max-pain-mark' : ''">
            {{ row.strike.toLocaleString() }}
          </span>
          <span style="text-align:right;color:#22c55e">{{ fmtNum(row.callOi) }}</span>
          <span style="text-align:right;color:#ef4444">{{ fmtNum(row.putOi) }}</span>
          <span style="text-align:right;color:var(--color-text-muted)">{{ (row.iv * 100).toFixed(0) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const COINS = ['BTC', 'ETH'] as const
type Coin = typeof COINS[number]

interface StrikeRow { strike: number; callOi: number; putOi: number; iv: number }
interface OptionsData {
  pcr: number
  maxPain: number
  totalOiUsd: number
  avgIv: number
  strikes: StrikeRow[]
}

const activeCoin = ref<Coin>('BTC')
const data    = ref<OptionsData | null>(null)
const loading = ref(false)
const error   = ref('')
let timer: ReturnType<typeof setInterval> | null = null

async function load() {
  loading.value = true
  error.value   = ''
  try {
    const coin = activeCoin.value
    const url  = `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${coin}&kind=option`
    const res  = await fetch(url)
    if (!res.ok) throw new Error(`Deribit ${res.status}`)
    const json = await res.json()
    const items: { instrument_name: string; open_interest: number; ask_iv: number; bid_iv: number; mid_iv?: number; mark_price: number; underlying_price: number }[] = json?.result ?? []
    if (!items.length) throw new Error('No data from Deribit')

    // Разбиваем по опционам: BTC-DDMMMYY-STRIKE-C/P
    const strikeMap = new Map<number, { callOi: number; putOi: number; ivSum: number; ivCount: number }>()
    let totalCallOi = 0, totalPutOi = 0, ivSum = 0, ivCount = 0
    const underlying = items[0].underlying_price ?? 0

    for (const item of items) {
      const parts = item.instrument_name.split('-')
      if (parts.length < 4) continue
      const strike = Number(parts[2])
      const side   = parts[3] // 'C' or 'P'
      if (!strike || isNaN(strike)) continue

      const oi = item.open_interest * (item.mark_price * underlying || 1)
      const iv = item.mid_iv ?? ((item.ask_iv + item.bid_iv) / 2) ?? 0

      if (!strikeMap.has(strike)) strikeMap.set(strike, { callOi: 0, putOi: 0, ivSum: 0, ivCount: 0 })
      const row = strikeMap.get(strike)!

      if (side === 'C') { row.callOi += oi; totalCallOi += oi }
      else              { row.putOi  += oi; totalPutOi  += oi }
      if (iv > 0) { row.ivSum += iv; row.ivCount++; ivSum += iv; ivCount++ }
    }

    // Max Pain: страйк с минимальной суммарной болью
    let maxPain = 0, minPain = Infinity
    for (const [strike, row] of strikeMap) {
      const pain = Array.from(strikeMap.entries()).reduce((acc, [s, r]) => {
        acc += s > strike ? (s - strike) * r.callOi : 0
        acc += s < strike ? (strike - s) * r.putOi  : 0
        return acc
      }, 0)
      if (pain < minPain) { minPain = pain; maxPain = strike }
    }

    data.value = {
      pcr:        totalCallOi > 0 ? totalPutOi / totalCallOi : 0,
      maxPain,
      totalOiUsd: totalCallOi + totalPutOi,
      avgIv:      ivCount > 0 ? ivSum / ivCount : 0,
      strikes: Array.from(strikeMap.entries())
        .map(([strike, r]) => ({
          strike,
          callOi: r.callOi,
          putOi:  r.putOi,
          iv:     r.ivCount > 0 ? r.ivSum / r.ivCount : 0,
        }))
        .sort((a, b) => a.strike - b.strike),
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Fetch error'
  } finally {
    loading.value = false
  }
}

// Центральные 20 страйков вокруг Max Pain
const topStrikes = computed(() => {
  if (!data.value) return []
  const mp  = data.value.maxPain
  const all = data.value.strikes
  const idx = all.findIndex(r => r.strike >= mp)
  const start = Math.max(0, idx - 10)
  return all.slice(start, start + 20)
})

function fmtNum(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toFixed(0)
}

onMounted(() => {
  load()
  timer = setInterval(load, 5 * 60_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.opts-widget  { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding: var(--space-2) var(--space-3); }
.opts-header  { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); flex-wrap: wrap; }
.opts-title   { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; flex: 1; }
.opts-coins   { display: flex; gap: 3px; }
.coin-btn {
  font-size: 10px; padding: 2px 6px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-interactive);
}
.coin-btn:hover  { border-color: var(--color-primary); color: var(--color-primary); }
.coin-btn.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.refresh-btn {
  font-size: 12px; padding: 2px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted); cursor: pointer;
  transition: all var(--transition-interactive);
}
.refresh-btn:hover    { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }
.opts-empty { color: var(--color-text-faint); font-size: 11px; padding: 8px; }
.opts-error { color: #ef4444; font-size: 11px; padding: 8px; }

/* Stats */
.opts-stats {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: var(--space-2); margin-bottom: var(--space-2);
}
.stat-item  { background: var(--color-surface-offset); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); }
.stat-label { display: block; font-size: 9px; color: var(--color-text-faint); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-val   { font-size: 13px; font-weight: 600; color: var(--color-text); font-variant-numeric: tabular-nums; }

/* Strikes table */
.opts-strikes { flex: 1; overflow-y: auto; }
.strikes-hdr  {
  display: grid; grid-template-columns: 1fr 1fr 1fr 48px;
  font-size: 9px; color: var(--color-text-faint);
  text-transform: uppercase; letter-spacing: 0.05em;
  padding: 3px 0; border-bottom: 1px solid var(--color-divider);
  position: sticky; top: 0; background: var(--color-surface);
}
.strike-row {
  display: grid; grid-template-columns: 1fr 1fr 1fr 48px;
  font-size: 10px; font-variant-numeric: tabular-nums;
  padding: 2px 0;
  border-bottom: 1px solid oklch(from var(--color-border) l c h / 0.3);
}
.max-pain-mark {
  color: var(--color-gold);
  font-weight: 700;
}
.max-pain-mark::after { content: ' ⚡'; font-size: 8px; }
</style>
