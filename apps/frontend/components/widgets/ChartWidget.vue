<!-- apps/frontend/components/widgets/ChartWidget.vue -->
<template>
  <div ref="chartEl" class="w-full h-full"></div>
</template>
<script setup lang="ts">
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries } from 'lightweight-charts'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
import type { NormalizedCandle } from '@crypto-platform/types'

const props = withDefaults(defineProps<{ symbol?:string; tf?:string }>(),
  { symbol:'BTC/USDT', tf:'1h' })
const chartEl = ref<HTMLElement|null>(null)
let chart: IChartApi|null = null
let series: ISeriesApi<'Candlestick'>|null = null

onMounted(()=>{
  if (!chartEl.value) return
  chart = createChart(chartEl.value, {
    layout:{ background:{ color:'transparent' }, textColor:'#cdccca' },
    grid:{ vertLines:{ color:'#262523' }, horzLines:{ color:'#262523' } },
    autoSize: true
  })
  series = chart.addSeries(CandlestickSeries, { upColor:'#22c55e', downColor:'#ef4444',
    borderVisible:false, wickUpColor:'#22c55e', wickDownColor:'#ef4444' })
})

useWidgetSubscription(`chart-${props.symbol}-${props.tf}`,
  [`ohlcv:${props.symbol}:${props.tf}`], props.symbol,
  (_ch, data) => {
    const c = data as NormalizedCandle
    series?.update({ time: Math.floor(c.ts/1000) as any, open:c.open, high:c.high, low:c.low, close:c.close })
  }
)
onUnmounted(()=>chart?.remove())
</script>
