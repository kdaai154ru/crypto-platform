<!-- apps/frontend/components/widgets/OIChartWidget.vue -->
<template>
  <div class="p-3 text-xs">
    <p class="text-muted mb-1">Open Interest</p>
    <p class="text-2xl font-mono">{{ formatUSD(latest?.oiUsd) }}</p>
    <p class="text-muted text-[10px] mt-1">{{ latest?.exchange ?? '—' }}</p>
  </div>
</template>
<script setup lang="ts">
import type { NormalizedOI } from '@crypto-platform/types'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const props = withDefaults(defineProps<{symbol?:string}>(), {symbol:'BTC/USDT'})
const latest = ref<NormalizedOI|null>(null)
useWidgetSubscription(`oi-${props.symbol}`, [`oi:${props.symbol}`], props.symbol,
  (_,d) => { latest.value = d as NormalizedOI })
const formatUSD = (v?:number) => v ? `$${(v/1e9).toFixed(2)}B` : '—'
</script>
