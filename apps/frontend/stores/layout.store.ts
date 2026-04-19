// apps/frontend/stores/layout.store.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DashboardLayout, WidgetLayout } from '@crypto-platform/types'
import { useLayoutPersistence } from '~/composables/useLayoutPersistence'

export const useLayoutStore = defineStore('layout', () => {
  const layouts = ref<DashboardLayout[]>([])
  const active  = ref<string | null>(null)
  const { load, save } = useLayoutPersistence()

  function init() {
    layouts.value = load()
    if (!layouts.value.length) {
      const def = defaultLayout()
      layouts.value = [def]
      active.value  = def.id
    } else {
      active.value = layouts.value[0]!.id
    }
  }

  function currentLayout(): DashboardLayout | undefined {
    return layouts.value.find(l => l.id === active.value)
  }

  function updateWidgets(lg: WidgetLayout[]) {
    const cur = currentLayout()
    if (!cur) return
    cur.breakpoints.lg = lg
    cur.updatedAt = Date.now()
    save(layouts.value)
  }

  function addWidget(w: WidgetLayout) {
    const cur = currentLayout()
    if (!cur) return
    const maxY = cur.breakpoints.lg.reduce((m, it) => Math.max(m, it.y + it.h), 0)
    cur.breakpoints.lg.push({ ...w, y: maxY })
    updateWidgets(cur.breakpoints.lg)
  }

  function defaultLayout(): DashboardLayout {
    return {
      id: crypto.randomUUID(),
      name: 'Default',
      updatedAt: Date.now(),
      breakpoints: {
        lg: [
          { i: 'market-overview-1', type: 'market-overview', x: 0, y: 0,  w: 12, h: 3,  visible: true },
          { i: 'chart-1',           type: 'chart',           x: 0, y: 3,  w: 9,  h: 8,  visible: true, settings: { symbol: 'BTC/USDT', tf: '1h' } },
          { i: 'trades-tape-1',     type: 'trades-tape',     x: 9, y: 3,  w: 3,  h: 8,  visible: true, settings: { symbol: 'BTC/USDT' } },
          { i: 'screener-rsi-1',    type: 'screener-rsi',    x: 0, y: 11, w: 12, h: 8,  visible: true },
          { i: 'oi-chart-1',        type: 'oi-chart',        x: 0, y: 19, w: 6,  h: 5,  visible: true, settings: { symbol: 'BTC/USDT' } },
          { i: 'funding-chart-1',   type: 'funding-chart',   x: 6, y: 19, w: 6,  h: 5,  visible: true, settings: { symbol: 'BTC/USDT' } },
        ],
        md: [],
        sm: []
      },
      globalSettings: { theme: 'dark', currency: 'USD' }
    }
  }

  return { layouts, active, init, currentLayout, updateWidgets, addWidget }
})