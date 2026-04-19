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
        <span class="widget-symbol" v-if="item.settings?.symbol">
          {{ item.settings.symbol }}
        </span>
        <span :class="['status-dot', statusDotStatus]" :title="moduleError ?? 'online'" />
      </div>
    </div>

    <!-- body -->
    <div class="widget-body">
      <Suspense>
        <component :is="widgetComponent" v-bind="item.settings ?? {}" />
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
import { computed, defineAsyncComponent } from 'vue'
import type { WidgetLayout } from '@crypto-platform/types'
import { useSystemStore } from '~/stores/system.store'

const props    = defineProps<{ item: WidgetLayout }>()
const sysStore = useSystemStore()

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

const moduleError     = computed(() => sysStore.widgetHasError(props.item.type))
const widgetComponent = computed(
  () => WIDGET_MAP[props.item.type] ?? WIDGET_MAP['market-overview']
)
const widgetTitle  = computed(() => TITLES[props.item.type] ?? props.item.type)

const statusDotStatus = computed(() => {
  if (!moduleError.value) return 'online'
  if (moduleError.value.includes('restarting')) return 'degraded'
  return 'offline'
})
</script>