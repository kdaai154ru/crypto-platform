// apps/frontend/stores/system.store.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SystemStatusPayload, ModuleStatus } from '@crypto-platform/types'

export const MODULE_WIDGET_MAP: Record<string, string[]> = {
  'exchange-core':    ['chart', 'trades-tape', 'orderbook', 'whale-feed'],
  'trades-core':      ['trades-tape', 'trades-delta', 'whale-feed'],
  'indicator-core':   ['chart'],
  'screener-core':    ['screener-rsi', 'screener-macd', 'heatmap-rsi'],
  'derivatives-core': ['oi-chart', 'funding-chart', 'liquidations-tape'],
  'etf-core':         ['etf-flow'],
  'whale-core':       ['whale-feed'],
  'options-core':     ['options-panel'],
  'alert-core':       ['alerts-panel'],
}

export const useSystemStore = defineStore('system', () => {
  const payload = ref<SystemStatusPayload | null>(null)

  function update(p: SystemStatusPayload) { payload.value = p }

  function moduleStatus(id: string): ModuleStatus {
    return payload.value?.modules.find(m => m.id === id)?.status ?? 'offline'
  }

  function widgetHasError(widgetType: string): string | null {
    for (const [modId, widgets] of Object.entries(MODULE_WIDGET_MAP)) {
      if (!widgets.includes(widgetType)) continue
      const st = moduleStatus(modId)
      if (st === 'offline')    return `${modId} offline`
      if (st === 'restarting') return `${modId} restarting`
    }
    return null
  }

  const systemOnline = computed(() =>
    payload.value?.modules.every(m => m.status === 'online' || m.status === 'degraded') ?? false
  )

  return { payload, update, moduleStatus, widgetHasError, systemOnline }
})