<!-- apps/frontend/components/widgets/FundingChartWidget.vue -->
<template>
  <div class="h-full flex flex-col">
    <div class="px-3 pt-2 pb-1 text-xs text-muted">Funding Rate · {{ props.symbol }}</div>
    <div class="flex-1 overflow-y-auto px-2 space-y-1">
      <div v-if="!items.length" class="text-center py-8 text-faint text-xs">Waiting for funding data…</div>
      <div
        v-for="item in items" :key="item.ts"
        class="flex justify-between text-xs py-0.5 px-1 rounded"
        :class="item.rate > 0 ? 'text-green-400' : item.rate < 0 ? 'text-red-400' : 'text-muted'"
      >
        <span>{{ fmtTime(item.ts) }}</span>
        <span>{{ item.exchange }}</span>
        <span>{{ (item.rate * 100).toFixed(4) }}%</span>
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

interface FundItem { ts: number; rate: number; exchange: string; symbol?: string }
const items = ref<FundItem[]>([])
const { subscribe, unsubscribe, connected } = useWsClient()

let cb: ((d: unknown) => void) | null = null
let currentSymbol = ''

function mountSub(sym: string) {
  if (cb) unsubscribe('deriv_fund', currentSymbol, cb)
  items.value = []
  currentSymbol = sym
  cb = (d: unknown) => {
    const item = d as FundItem
    if (item.symbol && item.symbol !== sym) return
    items.value.push(item)
    if (items.value.length > 100) items.value.shift()
  }
  subscribe('deriv_fund', sym, cb)
}

onMounted(() => { if (connected.value) mountSub(props.symbol) })
watch(() => props.symbol, (s) => { if (s && connected.value) mountSub(s) })
watch(connected, (v) => { if (v) mountSub(props.symbol) })
onUnmounted(() => { if (cb) unsubscribe('deriv_fund', currentSymbol, cb) })

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
}
</script>
