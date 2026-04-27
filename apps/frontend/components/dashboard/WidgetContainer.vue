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
        <!-- Symbol selector — показываем только для виджетов с symbol в settings -->
        <DashboardSymbolSelector
          v-if="localSymbol !== null"
          v-model="localSymbol"
        />
        <span :class="['status-dot', statusDotStatus]" :title="moduleError ?? 'online'" />
      </div>
    </div>

    <!-- body -->
    <div class="widget-body">
      <Suspense>
        <component :is="widgetComponent" v-bind="mergedSettings" />
        <template #fallback>
          <div class="widget-empty">
            <span class="widget-empty-icon">⏳</span>
            <span>Loading…</span>
          </div>
        </template>
      </Suspense>
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

// Lazy-load каждый виджет отдельно — не тянем всё сразу
const WIDGET_MAP: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  'chart':           defineAsyncComponent(() => import('~/components/widgets/ChartWidget.vue')),
  'trades-tape':     defineAsyncComponent(() => import('~/components/widgets/TradesTapeWidget.vue')),
  'screener-rsi':    defineAsyncComponent(() => import('~/components/widgets/ScreenerRsiWidget.vue')),
  'oi-chart':        defineAsyncComponent(() => import('~/components/widgets/OIChartWidget.vue')),
  'funding-chart':   defineAsyncComponent(() => import('~/components/widgets/FundingChartWidget.vue')),
  'market-overview': defineAsyncComponent(() => import('~/components/widgets/MarketOverviewWidget.vue')),
  'status-panel':    defineAsyncComponent(() => import('~/components/widgets/StatusPanelWidget.vue')),
  'whale-feed':      defineAsyncComponent(() => import('~/components/widgets/WhaleFeedWidget.vue')),
  'etf-flow':        defineAsyncComponent(() => import('~/components/widgets/EtfFlowWidget.vue')),
  'options-panel':   defineAsyncComponent(() => import('~/components/widgets/OptionsPanelWidget.vue')),
  'alerts-panel':    defineAsyncComponent(() => import('~/components/widgets/AlertsPanelWidget.vue')),
  'heatmap-rsi':     defineAsyncComponent(() => import('~/components/widgets/HeatmapRsiWidget.vue')),
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

// Виджеты у которых есть symbol в settings
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

// localSymbol — null если виджет не использует symbol
const localSymbol = ref<string | null>(
  SYMBOL_WIDGETS.has(props.item.type)
    ? (props.item.settings?.symbol as string ?? 'BTC/USDT')
    : null
)

// При смене symbol — обновляем store (персистируем) и передаём в виджет
watch(localSymbol, (s) => {
  if (s !== null) layoutStore.updateWidgetSettings(props.item.i, { symbol: s })
})

// Итоговые props для виджета: settings + актуальный symbol
const mergedSettings = computed(() => ({
  ...(props.item.settings ?? {}),
  ...(localSymbol.value !== null ? { symbol: localSymbol.value } : {}),
}))
</script>
