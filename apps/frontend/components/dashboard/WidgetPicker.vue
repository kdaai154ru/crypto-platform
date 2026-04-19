<!-- apps/frontend/components/dashboard/WidgetPicker.vue -->
<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="$emit('close')">
      <div class="modal-box" style="width:520px;max-height:80vh;overflow-y:auto">
        <div class="modal-header">
          <span class="modal-title">Add Widget</span>
          <button class="modal-close" @click="$emit('close')">×</button>
        </div>
        <div class="widget-picker-grid">
          <button
            v-for="w in WIDGETS" :key="w.type"
            class="widget-picker-card"
            @click="add(w)"
          >
            <span class="wpc-icon">{{ w.icon }}</span>
            <span class="wpc-label">{{ w.label }}</span>
            <span class="wpc-desc">{{ w.description }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { WidgetLayout } from '@crypto-platform/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; add: [w: WidgetLayout] }>()

const WIDGETS = [
  { type: 'chart',           icon: '📈', label: 'Price Chart',       description: 'Candlestick + indicators',     w: 9,  h: 8 },
  { type: 'trades-tape',     icon: '📋', label: 'Trades Tape',       description: 'Real-time trade stream',       w: 3,  h: 8 },
  { type: 'screener-rsi',    icon: '🔍', label: 'RSI Screener',      description: 'RSI across 500 pairs & 7 TFs', w: 12, h: 8 },
  { type: 'oi-chart',        icon: '📊', label: 'Open Interest',     description: 'OI tracker per symbol',        w: 6,  h: 5 },
  { type: 'funding-chart',   icon: '💸', label: 'Funding Rate',      description: 'Perpetual funding rates',      w: 6,  h: 5 },
  { type: 'market-overview', icon: '🌐', label: 'Market Overview',   description: 'Top tickers at a glance',      w: 12, h: 3 },
  { type: 'status-panel',    icon: '🖥',  label: 'System Status',     description: 'Module health monitor',        w: 6,  h: 6 },
  { type: 'whale-feed',      icon: '🐋', label: 'Whale Feed',        description: 'Large trades $100k+',          w: 4,  h: 8 },
  { type: 'etf-flow',        icon: '🏦', label: 'ETF Flows',         description: 'Bitcoin ETF daily flows',      w: 6,  h: 6 },
  { type: 'options-panel',   icon: '⚡', label: 'Options Analytics', description: 'PCR, Max Pain, GEX',           w: 6,  h: 6 },
  { type: 'alerts-panel',    icon: '🔔', label: 'Alerts',            description: 'Price & indicator alerts',     w: 4,  h: 8 },
  { type: 'heatmap-rsi',     icon: '🟥', label: 'RSI Heatmap',       description: 'Visual RSI heatmap',           w: 12, h: 6 },
]

function add(def: typeof WIDGETS[0]) {
  const item: WidgetLayout = {
    i: `${def.type}-${Date.now()}`,
    type: def.type,
    x: 0, y: 0,
    w: def.w, h: def.h,
    visible: true,
  }
  emit('add', item)
  emit('close')
}
</script>