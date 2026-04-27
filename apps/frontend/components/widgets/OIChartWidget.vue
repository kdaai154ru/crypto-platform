<!-- apps/frontend/components/widgets/OIChartWidget.vue -->
<template>
  <div class="h-full flex flex-col">
    <div class="px-3 pt-2 pb-1 text-xs text-muted">Open Interest · {{ props.symbol }}</div>
    <div class="flex-1 overflow-y-auto px-2 space-y-1">
      <div v-if="!items.length" class="text-center py-8 text-faint text-xs">Waiting for OI data…</div>
      <div
        v-for="item in items" :key="item.ts"
        class="flex justify-between text-xs py-0.5 px-1 rounded"
        :class="item.delta > 0 ? 'text-green-400' : item.delta < 0 ? 'text-red-400' : 'text-muted'"
      >
        <span>{{ fmtTime(item.ts) }}</span>
        <span>{{ fmtNum(item.oi) }}</span>
        <span>{{ item.delta > 0 ? '+' : '' }}{{ fmtNum(item.delta) }}</span>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useWsClient } from '~/composables/useWsClient'

const props = withDefaults(
  defineProps<{ symbol?: string }>(),
  { symbol: 'BTC/USDT' }
)

interface OIItem { ts: number; oi: number; delta: number; symbol?: string }
const items = ref<OIItem[]>([])
const { subscribe, unsubscribe, connected } = useWsClient()

let cb: ((d: unknown) => void) | null = null
let currentSymbol = ''

function mountSub(sym: string) {
  if (cb) unsubscribe('deriv_oi', currentSymbol, cb)
  items.value = []
  currentSymbol = sym
  cb = (d: unknown) => {
    const item = d as OIItem
    if (item.symbol && item.symbol !== sym) return
    items.value.push(item)
    if (items.value.length > 100) items.value.shift()
  }
  subscribe('deriv_oi', sym, cb)
}

onMounted(() => { if (connected.value) mountSub(props.symbol) })
watch(() => props.symbol, (s) => { if (s && connected.value) mountSub(s) })
watch(connected, (v) => { if (v) mountSub(props.symbol) })
onUnmounted(() => { if (cb) unsubscribe('deriv_oi', currentSymbol, cb) })

function fmtNum(n: number) {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>
