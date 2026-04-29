<!-- apps/frontend/components/widgets/EtfFlowWidget.vue -->
<template>
  <div class="etf-widget">
    <div class="etf-header">
      <span class="etf-title">Fear &amp; Greed</span>
      <button class="refresh-btn" @click="load" :disabled="loading">↻</button>
    </div>

    <div v-if="loading && !current" class="etf-empty">Loading…</div>
    <div v-else-if="error" class="etf-error">{{ error }}</div>

    <template v-else-if="current">
      <!-- Главное значение -->
      <div class="etf-main">
        <div class="etf-gauge" :style="{ '--pct': current.value }">
          <svg viewBox="0 0 100 56" class="gauge-svg">
            <!-- фоновая дуга -->
            <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#262523" stroke-width="10" stroke-linecap="round"/>
            <!-- активная дуга -->
            <path
              d="M10 50 A40 40 0 0 1 90 50"
              fill="none"
              :stroke="gaugeColor"
              stroke-width="10"
              stroke-linecap="round"
              :stroke-dasharray="`${(current.value / 100) * 125.6} 125.6`"
            />
          </svg>
          <div class="gauge-value" :style="{ color: gaugeColor }">{{ current.value }}</div>
          <div class="gauge-label">{{ current.value_classification }}</div>
        </div>
      </div>

      <!-- История 7 дней -->
      <div class="etf-history">
        <div v-for="item in history" :key="item.timestamp" class="hist-row">
          <span class="hist-date">{{ fmtDate(item.timestamp) }}</span>
          <div class="hist-bar-wrap">
            <div class="hist-bar" :style="{ width: item.value + '%', background: valueColor(item.value) }"></div>
          </div>
          <span class="hist-val" :style="{ color: valueColor(item.value) }">{{ item.value }}</span>
          <span class="hist-cls">{{ shortClass(item.value_classification) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface FngItem {
  value: number
  value_classification: string
  timestamp: string
  time_until_update?: string
}

const current = ref<FngItem | null>(null)
const history = ref<FngItem[]>([])
const loading = ref(false)
const error   = ref('')
let timer: ReturnType<typeof setInterval> | null = null

async function load() {
  loading.value = true
  error.value   = ''
  try {
    const res  = await fetch('https://api.alternative.me/fng/?limit=8')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const data: FngItem[] = (json.data ?? []).map((d: { value: string; value_classification: string; timestamp: string; time_until_update?: string }) => ({
      ...d,
      value: Number(d.value),
    }))
    if (!data.length) throw new Error('Empty response')
    current.value = data[0]
    history.value = data.slice(1)          // предыдущие 7 дней
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Fetch error'
  } finally {
    loading.value = false
  }
}

const gaugeColor = computed(() => valueColor(current.value?.value ?? 50))

function valueColor(v: number): string {
  if (v <= 25)  return '#ef4444'   // extreme fear
  if (v <= 45)  return '#f97316'   // fear
  if (v <= 55)  return '#eab308'   // neutral
  if (v <= 75)  return '#84cc16'   // greed
  return '#22c55e'                  // extreme greed
}

function shortClass(cls: string): string {
  const map: Record<string, string> = {
    'Extreme Fear': 'E.Fear', 'Fear': 'Fear', 'Neutral': 'Neutral',
    'Greed': 'Greed', 'Extreme Greed': 'E.Greed',
  }
  return map[cls] ?? cls
}

function fmtDate(ts: string): string {
  const d = new Date(Number(ts) * 1000)
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

onMounted(() => {
  load()
  timer = setInterval(load, 5 * 60_000)  // обновлять каждые 5 минут
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.etf-widget  { display: flex; flex-direction: column; height: 100%; padding: var(--space-2) var(--space-3); overflow: hidden; }
.etf-header  { display: flex; align-items: center; margin-bottom: var(--space-2); gap: var(--space-2); }
.etf-title   { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; flex: 1; }
.refresh-btn {
  font-size: 12px; padding: 2px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-interactive);
}
.refresh-btn:hover    { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }

.etf-empty { color: var(--color-text-faint); font-size: 11px; padding: 8px; }
.etf-error { color: #ef4444; font-size: 11px; padding: 8px; }

/* Gauge */
.etf-main    { display: flex; justify-content: center; margin-bottom: var(--space-2); }
.etf-gauge   { position: relative; width: 120px; text-align: center; }
.gauge-svg   { width: 100%; overflow: visible; }
.gauge-value {
  position: absolute;
  top: 30px; left: 50%; transform: translateX(-50%);
  font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums;
  line-height: 1;
}
.gauge-label {
  font-size: 10px; color: var(--color-text-muted);
  margin-top: 2px;
}

/* History */
.etf-history { flex: 1; overflow-y: auto; }
.hist-row    {
  display: grid;
  grid-template-columns: 48px 1fr 28px 48px;
  align-items: center;
  gap: var(--space-2);
  padding: 3px 0;
  border-bottom: 1px solid oklch(from var(--color-border) l c h / 0.4);
  font-size: 10px;
}
.hist-date   { color: var(--color-text-muted); white-space: nowrap; }
.hist-bar-wrap { background: var(--color-surface-offset); border-radius: var(--radius-full); height: 5px; overflow: hidden; }
.hist-bar    { height: 100%; border-radius: var(--radius-full); transition: width 0.4s ease; }
.hist-val    { font-variant-numeric: tabular-nums; text-align: right; font-weight: 600; }
.hist-cls    { color: var(--color-text-faint); }
</style>
