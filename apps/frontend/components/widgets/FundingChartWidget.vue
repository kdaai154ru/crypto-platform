<!-- apps/frontend/components/widgets/FundingChartWidget.vue -->
<template>
  <div class="p-3 text-xs">
    <p class="text-muted mb-1">Funding Rate</p>
    <p :class="['text-2xl font-mono', (latest?.rate??0)>=0?'text-green-400':'text-red-400']">
      {{ latest ? (latest.rate*100).toFixed(4)+'%' : '—' }}
    </p>
  </div>
</template>
<script setup lang="ts">
import type { NormalizedFunding } from '@crypto-platform/types'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const props = withDefaults(defineProps<{symbol?:string}>(), {symbol:'BTC/USDT'})
const latest = ref<NormalizedFunding|null>(null)
useWidgetSubscription(`fund-${props.symbol}`, [`funding:${props.symbol}`], props.symbol,
  (_,d) => { latest.value = d as NormalizedFunding })
</script>
