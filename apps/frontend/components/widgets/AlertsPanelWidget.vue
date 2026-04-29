<!-- apps/frontend/components/widgets/AlertsPanelWidget.vue -->
<template>
  <div class="alerts-widget">
    <div class="alerts-header">
      <span class="alerts-title">Alerts</span>
      <button class="add-btn" @click="showForm = !showForm">
        {{ showForm ? '✕' : '+ Add' }}
      </button>
    </div>

    <!-- Форма добавления -->
    <transition name="slide">
      <div v-if="showForm" class="alert-form">
        <div class="form-row">
          <label>Symbol</label>
          <input v-model="form.symbol" placeholder="BTCUSDT" class="form-input" />
        </div>
        <div class="form-row">
          <label>Type</label>
          <select v-model="form.indicator" class="form-input">
            <option value="price">Price</option>
            <option value="rsi">RSI (1h)</option>
          </select>
        </div>
        <div class="form-row">
          <label>Condition</label>
          <select v-model="form.condition" class="form-input">
            <option value="above">&gt; Above</option>
            <option value="below">&lt; Below</option>
          </select>
        </div>
        <div class="form-row">
          <label>Value</label>
          <input v-model.number="form.value" type="number" step="any" class="form-input" />
        </div>
        <button class="save-btn" @click="addAlert">Save Alert</button>
      </div>
    </transition>

    <!-- Лист алертов -->
    <div class="alerts-list">
      <p v-if="!alerts.length" class="empty-msg">No active alerts</p>
      <div
        v-for="a in alerts"
        :key="a.id"
        :class="['alert-row', a.triggered ? 'triggered' : a.active ? 'active' : 'inactive']"
      >
        <div class="alert-main">
          <span class="alert-sym">{{ a.symbol }}</span>
          <span class="alert-cond">
            {{ a.indicator === 'rsi' ? 'RSI' : '$' }}
            {{ a.condition === 'above' ? '>' : '<' }}
            {{ a.value }}
          </span>
          <span v-if="a.triggered" class="alert-badge triggered">Fired</span>
          <span v-else-if="a.active" class="alert-badge active">Active</span>
          <span v-else class="alert-badge inactive">Off</span>
        </div>
        <div class="alert-actions">
          <button class="icon-btn" @click="toggleAlert(a.id)" :title="a.active ? 'Pause' : 'Enable'">
            {{ a.active ? '⏸' : '▶' }}
          </button>
          <button class="icon-btn danger" @click="removeAlert(a.id)" title="Delete">✕</button>
        </div>
      </div>
    </div>

    <!-- История срабатываний -->
    <div v-if="log.length" class="alerts-log">
      <div class="log-title">⏰ History</div>
      <div v-for="(l, i) in log" :key="i" class="log-row">
        <span class="log-time">{{ l.time }}</span>
        <span class="log-msg">{{ l.msg }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useWsClient } from '~/composables/useWsClient'
import type { NormalizedTicker } from '@crypto-platform/types'

interface Alert {
  id: string
  symbol: string
  indicator: 'price' | 'rsi'
  condition: 'above' | 'below'
  value: number
  active: boolean
  triggered: boolean
}
interface LogEntry { time: string; msg: string }

const alerts = ref<Alert[]>([])
const log    = ref<LogEntry[]>([])
const showForm = ref(false)
const form = reactive<Omit<Alert, 'id' | 'active' | 'triggered'>>({
  symbol: 'BTCUSDT',
  indicator: 'price',
  condition: 'above',
  value: 0,
})

let idSeq = 0
function addAlert() {
  if (!form.symbol || !form.value) return
  alerts.value.push({
    id: `a${++idSeq}`,
    symbol:    form.symbol.toUpperCase().replace('/', '').replace('USDT', '') + 'USDT',
    indicator: form.indicator,
    condition: form.condition,
    value:     form.value,
    active:    true,
    triggered: false,
  })
  showForm.value = false
}

function toggleAlert(id: string) {
  const a = alerts.value.find(x => x.id === id)
  if (a) { a.triggered = false; a.active = !a.active }
}
function removeAlert(id: string) {
  alerts.value = alerts.value.filter(x => x.id !== id)
}

function fmtTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

function triggerAlert(a: Alert, currentVal: number) {
  if (a.triggered) return
  a.triggered = true
  const msg = `${a.symbol} ${a.indicator === 'rsi' ? 'RSI' : 'Price'} ${a.condition === 'above' ? '>' : '<'} ${a.value} (now: ${currentVal.toFixed(2)})`
  log.value.unshift({ time: fmtTime(), msg })
  if (log.value.length > 30) log.value.pop()
  // Браузерное уведомление
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Alert: ' + a.symbol, { body: msg, icon: '/favicon.ico' })
  }
}

// Проверка по тикерам (price alerts)
const { subscribe, unsubscribe, onEveryReady } = useWsClient()
const tickerSubs = new Map<string, (d: unknown) => void>()

function mountTickerSubs() {
  // отписываемся от всех старых
  for (const [sym, cb] of tickerSubs) { unsubscribe('ticker', sym, cb) }
  tickerSubs.clear()

  const priceAlerts = alerts.value.filter(a => a.active && a.indicator === 'price')
  const syms = [...new Set(priceAlerts.map(a => a.symbol.replace('USDT', '/USDT')))]
  for (const sym of syms) {
    const cb = (d: unknown) => {
      const t = d as NormalizedTicker
      const relevant = alerts.value.filter(
        a => a.active && !a.triggered && a.indicator === 'price' &&
             (a.symbol === sym.replace('/', '') || a.symbol === sym)
      )
      for (const a of relevant) {
        if (a.condition === 'above' && t.last >= a.value) triggerAlert(a, t.last)
        if (a.condition === 'below' && t.last <= a.value) triggerAlert(a, t.last)
      }
    }
    subscribe('ticker', sym, cb)
    tickerSubs.set(sym, cb)
  }
}

// RSI алерты — проверяем через REST
function calcRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  let g = 0, l = 0
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i-1]; d > 0 ? (g += d) : (l -= d) }
  let ag = g / period, al = l / period
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1]
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al)
}

async function checkRsiAlerts() {
  const rsiAlerts = alerts.value.filter(a => a.active && !a.triggered && a.indicator === 'rsi')
  const syms = [...new Set(rsiAlerts.map(a => a.symbol))]
  for (const sym of syms) {
    try {
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1h&limit=100`)
      if (!r.ok) continue
      const data: [number, string, string, string, string, ...unknown[]][] = await r.json()
      const closes = data.map(k => parseFloat(k[4]))
      const rsi = calcRsi(closes)
      if (rsi === null) continue
      for (const a of rsiAlerts.filter(x => x.symbol === sym)) {
        if (a.condition === 'above' && rsi >= a.value) triggerAlert(a, rsi)
        if (a.condition === 'below' && rsi <= a.value) triggerAlert(a, rsi)
      }
    } catch { /* игнорируем ошибки сети */ }
  }
}

let rsiTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // Запрашиваем разрешение на push-уведомления
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
  rsiTimer = setInterval(checkRsiAlerts, 60_000)
})
onEveryReady(mountTickerSubs)
onUnmounted(() => {
  for (const [sym, cb] of tickerSubs) unsubscribe('ticker', sym, cb)
  if (rsiTimer) clearInterval(rsiTimer)
})
</script>

<style scoped>
.alerts-widget { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.alerts-header {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-divider); flex-shrink: 0;
}
.alerts-title { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; flex: 1; }
.add-btn {
  font-size: 11px; padding: 3px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-primary);
  background: transparent; color: var(--color-primary);
  cursor: pointer; font-weight: 600;
  transition: all var(--transition-interactive);
}
.add-btn:hover { background: var(--color-primary); color: #fff; }

/* Form */
.alert-form {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-surface-offset);
}
.form-row   { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.form-row label { font-size: 10px; color: var(--color-text-muted); width: 60px; flex-shrink: 0; }
.form-input {
  flex: 1; font-size: 11px;
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}
.save-btn {
  width: 100%; padding: 5px;
  font-size: 11px; font-weight: 600;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--color-primary);
  color: #fff; cursor: pointer;
  transition: background var(--transition-interactive);
}
.save-btn:hover { background: var(--color-primary-hover); }

/* Slide transition */
.slide-enter-active, .slide-leave-active { transition: max-height 0.25s ease, opacity 0.2s; overflow: hidden; }
.slide-enter-from, .slide-leave-to { max-height: 0; opacity: 0; }
.slide-enter-to, .slide-leave-from { max-height: 300px; opacity: 1; }

/* List */
.alerts-list { flex: 1; overflow-y: auto; padding: var(--space-2); }
.empty-msg   { font-size: 11px; color: var(--color-text-faint); padding: var(--space-2); text-align: center; }
.alert-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  margin-bottom: var(--space-1);
  transition: border-color var(--transition-interactive);
}
.alert-row.triggered { border-color: #f97316; background: rgba(249,115,22,0.06); }
.alert-row.active    { border-color: var(--color-border); }
.alert-row.inactive  { opacity: 0.5; }
.alert-main  { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.alert-sym   { font-size: 11px; font-weight: 600; color: var(--color-text); }
.alert-cond  { font-size: 10px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.alert-badge {
  font-size: 9px; padding: 1px 5px;
  border-radius: var(--radius-full);
  font-weight: 600; letter-spacing: 0.03em;
}
.alert-badge.triggered { background: rgba(249,115,22,0.2); color: #f97316; }
.alert-badge.active    { background: rgba(34,197,94,0.15);  color: #22c55e; }
.alert-badge.inactive  { background: var(--color-surface-offset); color: var(--color-text-faint); }
.alert-actions { display: flex; gap: 4px; flex-shrink: 0; }
.icon-btn {
  font-size: 11px; padding: 2px 5px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-offset);
  color: var(--color-text-muted);
  cursor: pointer; line-height: 1;
  transition: all var(--transition-interactive);
}
.icon-btn:hover       { border-color: var(--color-primary); color: var(--color-primary); }
.icon-btn.danger:hover{ border-color: #ef4444; color: #ef4444; }

/* Log */
.alerts-log {
  border-top: 1px solid var(--color-divider);
  padding: var(--space-2); max-height: 100px; overflow-y: auto;
}
.log-title { font-size: 9px; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.log-row   { display: flex; gap: var(--space-2); font-size: 10px; margin-bottom: 2px; }
.log-time  { color: var(--color-text-faint); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.log-msg   { color: var(--color-text-muted); }
</style>
