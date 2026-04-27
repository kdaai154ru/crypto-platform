<!-- apps/frontend/components/dashboard/WidgetPicker.vue -->
<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="$emit('close')">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Add Widget</span>
          <button class="modal-close" @click="$emit('close')">×</button>
        </div>
        <div class="widget-picker-grid">
          <button
            v-for="w in WIDGETS"
            :key="w.type"
            :class="['widget-picker-card', isActive(w.type) && 'wpc-active']"
            @click="toggle(w)"
          >
            <span class="wpc-check" v-if="isActive(w.type)">✓</span>
            <span class="wpc-icon">{{ w.icon }}</span>
            <span class="wpc-label">{{ w.label }}</span>
            <span class="wpc-desc">{{ w.description }}</span>
          </button>
        </div>
        <div class="picker-footer">
          <!-- inline confirmation вместо confirm() — работает в любых окружениях -->
          <div v-if="confirmReset" class="reset-confirm">
            <span>Сбросить layout?</span>
            <button class="btn-confirm-yes" @click="doReset">Да</button>
            <button class="btn-confirm-no"  @click="confirmReset = false">Нет</button>
          </div>
          <button v-else class="btn-picker-reset" @click="confirmReset = true">↺ Reset layout</button>
          <button class="btn-picker-done" @click="$emit('close')">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useLayoutStore } from '~/stores/layout.store'

// Компонент рендерит <Teleport> как корень (fragment) →
// Vue не может унаследовать listeners автоматически.
// inheritAttrs: false + явный defineEmits убирает Vue warn.
defineOptions({ inheritAttrs: false })

defineProps<{ open: boolean }>()

// 'add' убран: Toolbar не использует этот emit,
// toggleWidget обновляет store реактивно — перерисовка происходит автоматически.
const emit = defineEmits<{
  close: []
}>()

const layoutStore  = useLayoutStore()
const confirmReset = ref(false)

const WIDGETS = [
  { type: 'chart',           icon: '📈', label: 'Price Chart',       description: 'Candlestick + indicators',     w: 9,  h: 8  },
  { type: 'trades-tape',     icon: '📋', label: 'Trades Tape',       description: 'Real-time trade stream',       w: 3,  h: 8  },
  { type: 'screener-rsi',    icon: '🔍', label: 'RSI Screener',      description: 'RSI across 500 pairs & 7 TFs', w: 12, h: 8  },
  { type: 'oi-chart',        icon: '📊', label: 'Open Interest',     description: 'OI tracker per symbol',        w: 6,  h: 5  },
  { type: 'funding-chart',   icon: '💸', label: 'Funding Rate',      description: 'Perpetual funding rates',      w: 6,  h: 5  },
  { type: 'market-overview', icon: '🌐', label: 'Market Overview',   description: 'Top tickers at a glance',      w: 12, h: 3  },
  { type: 'status-panel',    icon: '🖥',  label: 'System Status',     description: 'Module health monitor',        w: 6,  h: 6  },
  { type: 'whale-feed',      icon: '🐋', label: 'Whale Feed',        description: 'Large trades $100k+',          w: 4,  h: 8  },
  { type: 'etf-flow',        icon: '🏦', label: 'ETF Flows',         description: 'Bitcoin ETF daily flows',      w: 6,  h: 6  },
  { type: 'options-panel',   icon: '⚡', label: 'Options Analytics', description: 'PCR, Max Pain, GEX',           w: 6,  h: 6  },
  { type: 'alerts-panel',    icon: '🔔', label: 'Alerts',            description: 'Price & indicator alerts',     w: 4,  h: 8  },
  { type: 'heatmap-rsi',     icon: '🟥', label: 'RSI Heatmap',       description: 'Visual RSI heatmap',           w: 12, h: 6  },
] as const

function isActive(type: string) {
  return layoutStore.isWidgetVisible(type)
}

function toggle(w: typeof WIDGETS[number]) {
  // toggleWidget реактивно обновляет store → visibleItems пересчитывается автоматически
  layoutStore.toggleWidget(w.type, { w: w.w, h: w.h })
}

function doReset() {
  layoutStore.reset()
  confirmReset.value = false
  emit('close')
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: oklch(0 0 0 / 0.55);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.modal-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text); }
.modal-close {
  font-size: 18px; color: var(--color-text-muted); line-height: 1;
  padding: 0 4px; border-radius: var(--radius-sm); transition: color 120ms;
}
.modal-close:hover { color: var(--color-text); }
.widget-picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  padding: var(--space-4);
  overflow-y: auto;
}
.widget-picker-card {
  position: relative;
  display: flex; flex-direction: column; align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer; text-align: left;
  transition: border-color 120ms, background 120ms;
}
.widget-picker-card:hover { border-color: var(--color-primary); background: var(--color-surface-offset); }
.widget-picker-card.wpc-active { border-color: var(--color-primary); background: var(--color-primary-highlight); }
.wpc-check { position: absolute; top: 6px; right: 8px; font-size: 12px; color: var(--color-primary); font-weight: 700; }
.wpc-icon  { font-size: 20px; line-height: 1; }
.wpc-label { font-size: var(--text-xs); font-weight: 600; color: var(--color-text); }
.wpc-desc  { font-size: 11px; color: var(--color-text-muted); line-height: 1.3; }
.picker-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-divider);
  flex-shrink: 0;
  min-height: 44px;
}
.reset-confirm {
  display: flex; align-items: center; gap: var(--space-2);
  font-size: var(--text-xs); color: var(--color-text-muted);
}
.btn-confirm-yes {
  padding: 2px 10px; border-radius: var(--radius-sm);
  font-size: var(--text-xs); font-weight: 600;
  background: var(--color-warning); color: #fff;
  border: none; cursor: pointer;
}
.btn-confirm-no {
  padding: 2px 10px; border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  background: var(--color-surface-offset); color: var(--color-text-muted);
  border: 1px solid var(--color-border); cursor: pointer;
}
.btn-picker-reset {
  font-size: var(--text-xs); color: var(--color-text-muted);
  padding: 4px 8px; border-radius: var(--radius-sm);
  border: 1px solid var(--color-border); background: transparent;
  cursor: pointer; transition: all 120ms;
}
.btn-picker-reset:hover { color: var(--color-warning); border-color: var(--color-warning); }
.btn-picker-done {
  font-size: var(--text-xs); font-weight: 600; color: var(--color-primary);
  padding: 4px 16px; border-radius: var(--radius-sm);
  border: 1px solid var(--color-primary);
  background: var(--color-primary-highlight);
  cursor: pointer; transition: all 120ms;
}
.btn-picker-done:hover { background: var(--color-primary); color: white; }
</style>
