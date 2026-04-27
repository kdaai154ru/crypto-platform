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
        <DashboardSymbolSelector
          v-if="localSymbol !== null"
          v-model="localSymbol"
        />
        <span :class="['status-dot', statusDotStatus]" :title="moduleError ?? 'online'" />
      </div>
    </div>

    <!-- body: no <Suspense> — it's experimental and causes console warnings.
         defineAsyncComponent handles loading/error states internally. -->
    <div class="widget-body">
      <component :is="widgetComponent" v-bind="mergedSettings" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, defineAsyncComponent } from 'vue'
import type { WidgetLayout } from '@crypto-platform/types'
import { useSystemStore } from '~/stores/system.store'
import { useLayoutStore } from '~/stores/layout.store'

const props       = defineProps<{ item: WidgetLayout }>()
const sysStore    = useSystemStore()
const layoutStore = useLayoutStore()

const LoadingWidget = { template: '<div class="widget-empty"><span>Loading…</span></div>' }
const ErrorWidget   = { template: '<div class="widget-empty"><span style="color:var(--color-error)">Failed to load</span></div>' }

function lazy(imp: () => Promise<unknown>) {
  return defineAsyncComponent({
    loader: imp as () => Promise<{ default: object }>,
    loadingComponent: LoadingWidget,
    errorComponent: ErrorWidget,
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

const SYMBOL_WIDGETS = new Set([
  'chart', 'trades-tape', 'oi-chart', 'funding-chart', 'whale-feed',
])

const moduleError     = computed(() => sysStore.widgetHasError(props.item.type))
const widgetComponent = computed(
  () => WIDGET_MAP[props.item.type] ?? WIDGET_MAP['market-overview']
)
const widgetTitle = computed(() => TITLES[props.item.type] ?? props.item.type)

const statusDotStatus = computed(() => {
  if (!moduleError.value) return 'online'
  if (moduleError.value.includes('restarting')) return 'degraded'
  return 'offline'
})

const localSymbol = ref<string | null>(
  SYMBOL_WIDGETS.has(props.item.type)
    ? (props.item.settings?.symbol as string ?? 'BTC/USDT')
    : null
)

watch(localSymbol, (s) => {
  if (s !== null) layoutStore.updateWidgetSettings(props.item.i, { symbol: s })
})

const mergedSettings = computed(() => ({
  ...(props.item.settings ?? {}),
  ...(localSymbol.value !== null ? { symbol: localSymbol.value } : {}),
}))
</script>
