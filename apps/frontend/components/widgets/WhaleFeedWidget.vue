<!-- apps/frontend/components/widgets/WhaleFeedWidget.vue -->
<template>
  <div class="h-full overflow-y-auto px-2 py-1 space-y-1">
    <div class="px-1 py-0.5 text-xs text-muted">Whale Feed · {{ props.symbol }}</div>
    <div v-if="!events.length" class="text-center py-8 text-faint text-xs">No whale events yet…</div>
    <div
      v-for="e in displayEvents" :key="e.ts"
      class="flex flex-col gap-0.5 px-2 py-1 rounded bg-yellow-400/5 border border-yellow-400/20 text-xs"
    >
      <div class="flex justify-between">
        <span class="font-bold" :class="e.side === 'buy' ? 'text-green-400' : 'text-red-400'">
          {{ e.side?.toUpperCase() }} {{ fmtNum(e.usdValue) }}
        </span>
        <span class="text-faint">{{ fmtTime(e.ts) }}</span>
      </div>
      <div class="text-muted">{{ e.exchange }} · {{ e.symbol }}</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useWsClient } from '~/composables/useWsClient'

const props = withDefaults(
  defineProps<{ symbol?: string }>(),
  { symbol: 'BTC/USDT' }
)

interface WhaleEvent { ts: number; side: string; usdValue: number; exchange: string; symbol?: string }
const events = ref<WhaleEvent[]>([])
const { subscribe, unsubscribe, connected } = useWsClient()

let cb: ((d: unknown) => void) | null = null
let currentSymbol = ''

function mountSub(sym: string) {
  if (cb) unsubscribe('whale_event', currentSymbol, cb)
  events.value = []
  currentSymbol = sym
  cb = (d: unknown) => {
    const e = d as WhaleEvent
    if (e.symbol && e.symbol !== sym) return
    events.value.push(e)
    if (events.value.length > 100) events.value.shift()
  }
  subscribe('whale_event', sym, cb)
}

onMounted(() => { if (connected.value) mountSub(props.symbol) })
watch(() => props.symbol, (s) => { if (s && connected.value) mountSub(s) })
watch(connected, (v) => { if (v) mountSub(props.symbol) })
onUnmounted(() => { if (cb) unsubscribe('whale_event', currentSymbol, cb) })

const displayEvents = computed(() => events.value.slice().reverse())

function fmtNum(n: number) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>
