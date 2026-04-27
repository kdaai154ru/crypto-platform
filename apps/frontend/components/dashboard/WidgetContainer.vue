<!-- apps/frontend/components/dashboard/WidgetContainer.vue -->
<template>
  <div class="widget-container" :class="{ 'is-edit': editMode }">
    <!-- drag handle — видна только в Edit-режиме -->
    <div
      v-if="editMode"
      class="widget-drag-handle"
      @mousedown.stop="$emit('drag-start', $event)"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="4" cy="4" r="1.2" fill="currentColor"/>
        <circle cx="10" cy="4" r="1.2" fill="currentColor"/>
        <circle cx="4" cy="7"  r="1.2" fill="currentColor"/>
        <circle cx="10" cy="7"  r="1.2" fill="currentColor"/>
        <circle cx="4" cy="10" r="1.2" fill="currentColor"/>
        <circle cx="10" cy="10" r="1.2" fill="currentColor"/>
      </svg>
      <span>drag to move</span>
    </div>

    <!-- module error overlay -->
    <div v-if="moduleError" class="widget-error-overlay">
      <span style="font-size:20px">⚠️</span>
      <span class="error-title">{{ moduleError }}</span>
      <span class="error-sub">Last data preserved below</span>
    </div>

    <!-- header -->
    <div class="widget-header">
      <span class="widget-title">{{ widgetTitle }}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <DashboardSymbolSelector v-if="isSymbolWidget" />
        <span :class="['status-dot', statusDotStatus]" :title="moduleError ?? 'online'" />
      </div>
    </div>

    <!-- body -->
    <!-- widgetProps передаётся только тем виджетам, у которых есть settings -->
    <!-- чтобы не генерировать Vue warn о неизвестных props -->
    <div class="widget-body">
      <component
        :is="widgetComponent"
        v-if="hasSettings"
        v-bind="widgetProps"
      />
      <component :is="widgetComponent" v-else />
    </div>

    <!-- resize handle — только в Edit-режиме -->
    <div
      v-if="editMode"
      class="widget-resize-handle"
      @mousedown.stop="$emit('resize-start', $event)"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M9 3L3 9M11 6L6 11M11 9L9 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import type { WidgetLayout } from '@crypto-platform/types'
import { useSystemStore } from '~/stores/system.store'

const props = defineProps<{ item: WidgetLayout; editMode?: boolean }>()
const emit  = defineEmits<{
  'drag-start':   [e: MouseEvent]
  'resize-start': [e: MouseEvent]
}>()

const sysStore = useSystemStore()

const LoadingWidget = { template: '<div class="widget-empty"><span>Loading…</span></div>' }
const ErrorWidget   = { template: '<div class="widget-empty"><span style="color:var(--color-error)">Failed to load</span></div>' }

function lazy(imp: () => Promise<unknown>) {
  return defineAsyncComponent({
    loader: imp as () => Promise<{ default: object }>,
    loadingComponent: LoadingWidget,
    errorComponent:   ErrorWidget,
    delay: 100,
    timeout: 10000,
  })
}

// Виджеты, которые принимают settings-props (symbol, tf)
const SETTINGS_WIDGETS = new Set([
  'chart', 'trades-tape', 'oi-chart', 'funding-chart',
])

const WIDGET_MAP: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  'chart':           lazy(() => import('~/components/widgets/ChartWidget.vue')),
  'trades-tape':     lazy(() => import('~/components/widgets/TradesTapeWidget.vue')),
  'screener-rsi':    lazy(() => import('~/components/widgets/ScreenerRsiWidget.vue')),
  'oi-chart':        lazy(() => import('~/components/widgets/OIChartWidget.vue')),
  'funding-chart':   lazy(() => import('~/components/widgets/FundingChartWidget.vue')),
  'market-overview': lazy(() => import('~/components/widgets/MarketOverviewWidget.vue')),
  'status-panel':    lazy(() => import('~/components/widgets/StatusPanelWidget.vue')),
  'whale-feed':      lazy(() => import('~/components/widgets/WhaleFeedWidget.vue')),
  'etf-flow':        lazy(() => import('~/components/widgets/EtfFlowWidget.vue')),
  'options-panel':   lazy(() => import('~/components/widgets/OptionsPanelWidget.vue')),
  'alerts-panel':    lazy(() => import('~/components/widgets/AlertsPanelWidget.vue')),
  'heatmap-rsi':     lazy(() => import('~/components/widgets/HeatmapRsiWidget.vue')),
}

const TITLES: Record<string, string> = {
  'chart':           'Chart',
  'trades-tape':     'Trades',
  'screener-rsi':    'RSI Screener',
  'oi-chart':        'Open Interest',
  'funding-chart':   'Funding Rate',
  'market-overview': 'Market Overview',
  'status-panel':    'System Status',
  'whale-feed':      'Whale Feed',
  'etf-flow':        'ETF Flows',
  'options-panel':   'Options Analytics',
  'alerts-panel':    'Alerts',
  'heatmap-rsi':     'RSI Heatmap',
}

const SYMBOL_WIDGETS = new Set(['chart', 'trades-tape', 'oi-chart', 'funding-chart', 'whale-feed'])

const moduleError     = computed(() => sysStore.widgetHasError(props.item.type))
const widgetComponent = computed(() => WIDGET_MAP[props.item.type] ?? WIDGET_MAP['market-overview'])
const widgetTitle     = computed(() => TITLES[props.item.type] ?? props.item.type)
const isSymbolWidget  = computed(() => SYMBOL_WIDGETS.has(props.item.type))
const hasSettings     = computed(() =>
  SETTINGS_WIDGETS.has(props.item.type) &&
  props.item.settings &&
  Object.keys(props.item.settings).length > 0
)

const statusDotStatus = computed(() => {
  if (!moduleError.value) return 'online'
  if (moduleError.value.includes('restarting')) return 'degraded'
  return 'offline'
})

// Передаём settings только виджетам, которые их ожидают
const widgetProps = computed(() => props.item.settings ?? {})
</script>

<style scoped>
.widget-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
}
.widget-container.is-edit {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary-highlight);
}
.widget-drag-handle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 2px var(--space-2);
  background: var(--color-primary-highlight);
  color: var(--color-primary);
  font-size: 10px;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid var(--color-primary);
  flex-shrink: 0;
}
.widget-drag-handle:active { cursor: grabbing; }
.widget-error-overlay {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: color-mix(in oklch, var(--color-warning) 15%, var(--color-surface));
  border-bottom: 1px solid var(--color-warning);
  z-index: 10;
}
.error-title { font-size: var(--text-xs); font-weight: 500; color: var(--color-warning); }
.error-sub   { font-size: var(--text-xs); color: var(--color-text-muted); }
.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  min-height: 36px;
}
.widget-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.status-dot.online   { background: var(--color-success); }
.status-dot.degraded { background: var(--color-warning); }
.status-dot.offline  { background: var(--color-error); }
.widget-body {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
}
.widget-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.widget-resize-handle {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  cursor: se-resize;
  opacity: 0;
  transition: opacity 150ms;
  border-radius: var(--radius-sm);
  background: var(--color-primary-highlight);
}
.widget-container:hover .widget-resize-handle,
.widget-container.is-edit .widget-resize-handle {
  opacity: 1;
}
</style>
