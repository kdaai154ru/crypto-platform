<!-- apps/frontend/components/dashboard/WidgetContainer.vue -->
<template>
  <div class="widget-container">
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
        <!-- FIX: SymbolSelector — глобальный компонент через symbolStore,
             v-model не нужен. Показываем только для виджетов с символом. -->
        <DashboardSymbolSelector v-if="isSymbolWidget" />
        <span :class="['status-dot', statusDotStatus]" :title="moduleError ?? 'online'" />
      </div>
    </div>

    <!-- body -->
    <div class="widget-body">
      <component :is="widgetComponent" v-bind="widgetSettings" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import type { WidgetLayout } from '@crypto-platform/types'
import { useSystemStore } from '~/stores/system.store'

const props    = defineProps<{ item: WidgetLayout }>()
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

// FIX: виджеты с символом — SymbolSelector показывается глобально через store,
// все эти виджеты уже читают symbolStore.activeSymbol напрямую.
const SYMBOL_WIDGETS = new Set([
  'chart', 'trades-tape', 'oi-chart', 'funding-chart', 'whale-feed',
])

const moduleError     = computed(() => sysStore.widgetHasError(props.item.type))
const widgetComponent = computed(() => WIDGET_MAP[props.item.type] ?? WIDGET_MAP['market-overview'])
const widgetTitle     = computed(() => TITLES[props.item.type] ?? props.item.type)
const isSymbolWidget  = computed(() => SYMBOL_WIDGETS.has(props.item.type))

const statusDotStatus = computed(() => {
  if (!moduleError.value) return 'online'
  if (moduleError.value.includes('restarting')) return 'degraded'
  return 'offline'
})

// FIX: убираем localSymbol/v-model — виджеты читают symbolStore напрямую.
// Передаём только статичные settings из layout (tf и т.д.), без symbol.
const widgetSettings = computed(() => props.item.settings ?? {})
</script>
