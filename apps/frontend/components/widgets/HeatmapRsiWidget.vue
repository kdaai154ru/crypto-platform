<!-- apps/frontend/components/widgets/HeatmapRsiWidget.vue -->
<template>
  <div class="h-full overflow-auto p-2">
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:3px">
      <div v-for="cell in cells" :key="cell.symbol"
           :style="`background:${rsiBackground(cell.rsi)};border-radius:4px;padding:5px 4px;text-align:center`">
        <div style="font-size:9px;color:rgba(255,255,255,0.7);margin-bottom:1px">{{ cell.symbol.replace('/USDT','') }}</div>
        <div style="font-size:12px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums">
          {{ cell.rsi?.toFixed(0) ?? '—' }}
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'
const cells = ref<{ symbol: string; rsi: number }[]>([])

function rsiBackground(v?: number) {
  if (!v) return 'var(--color-surface-3)'
  if (v >= 70) return 'rgba(248,113,113,0.7)'
  if (v <= 30) return 'rgba(74,222,128,0.6)'
  const norm = (v - 30) / 40
  return `rgba(${Math.round(norm*248)}, ${Math.round((1-norm)*200+50)}, 100, 0.5)`
}

useWidgetSubscription('heatmap-rsi', ['screener:update'], '', (_, d) => {
  const arr = d as any[]
  for (const r of arr) {
    if (r.screener !== 'rsi' || r.tf !== '1h') continue
    const idx = cells.value.findIndex(c => c.symbol === r.symbol)
    if (idx >= 0) cells.value[idx].rsi = r.value
    else cells.value.push({ symbol: r.symbol, rsi: r.value })
  }
})
</script>