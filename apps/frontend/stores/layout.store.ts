// apps/frontend/stores/layout.store.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DashboardLayout, WidgetLayout } from '@crypto-platform/types'
import { useLayoutPersistence } from '~/composables/useLayoutPersistence'

export const useLayoutStore = defineStore('layout', () => {
  const layouts  = ref<DashboardLayout[]>([])
  const active   = ref<string | null>(null)
  const editMode = ref(false)
  const { load, save } = useLayoutPersistence()

  function init() {
    const stored = load()
    if (!stored.length) {
      reset()
    } else {
      layouts.value = stored
      active.value  = stored[0]!.id
    }
  }

  function reset() {
    editMode.value = false
    const def = defaultLayout()
    layouts.value  = [def]
    active.value   = def.id
    save(layouts.value)
  }

  // Явный setter — не мутируем ref напрямую из шаблона/компонентов,
  // это предотвращает лишние Vue warn при batch-обновлениях Pinia.
  function setEditMode(val: boolean) {
    editMode.value = val
  }

  function currentLayout(): DashboardLayout | undefined {
    return layouts.value.find(l => l.id === active.value)
  }

  function currentWidgets(): WidgetLayout[] {
    return currentLayout()?.breakpoints.lg ?? []
  }

  function updateWidgets(lg: WidgetLayout[]) {
    const cur = currentLayout()
    if (!cur) return
    cur.breakpoints.lg = lg
    cur.updatedAt      = Date.now()
    save(layouts.value)
  }

  function addWidget(w: WidgetLayout) {
    const cur = currentLayout()
    if (!cur) return
    const existing = cur.breakpoints.lg.find(it => it.type === w.type)
    if (existing) {
      existing.visible  = true
      cur.updatedAt     = Date.now()
      save(layouts.value)
      return
    }
    const maxY = cur.breakpoints.lg.reduce((m, it) => Math.max(m, it.y + it.h), 0)
    cur.breakpoints.lg.push({ ...w, y: maxY })
    updateWidgets(cur.breakpoints.lg)
  }

  function toggleWidget(
    type: string,
    def: Omit<WidgetLayout, 'i' | 'x' | 'y' | 'visible'>,
  ) {
    const cur = currentLayout()
    if (!cur) return                       // guard: store ещё не инициализирован
    const existing = cur.breakpoints.lg.find(it => it.type === type)
    if (existing) {
      existing.visible = !existing.visible
      cur.updatedAt    = Date.now()
      save(layouts.value)
    } else {
      const maxY = cur.breakpoints.lg.reduce((m, it) => Math.max(m, it.y + it.h), 0)
      const newWidget: WidgetLayout = {
        ...def,
        i:       `${type}-${Date.now()}`,
        type,
        x:       0,
        y:       maxY,
        visible: true,
      }
      // Пушим в копию чтобы не мутировать reactive array напрямую несколько раз
      const updated = [...cur.breakpoints.lg, newWidget]
      updateWidgets(updated)
    }
  }

  function isWidgetVisible(type: string): boolean {
    const cur = currentLayout()
    if (!cur) return false
    const w = cur.breakpoints.lg.find(it => it.type === type)
    return w?.visible ?? false
  }

  function updateWidgetSettings(widgetId: string, patch: Record<string, unknown>) {
    const cur = currentLayout()
    if (!cur) return
    const widget = cur.breakpoints.lg.find(w => w.i === widgetId)
    if (!widget) return
    widget.settings = { ...(widget.settings ?? {}), ...patch }
    cur.updatedAt   = Date.now()
    save(layouts.value)
  }

  // 12-column layout (COLS=12 в DashboardGrid)
  function defaultLayout(): DashboardLayout {
    return {
      id:        crypto.randomUUID(),
      name:      'Default',
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
        sm: [],
      },
      globalSettings: { theme: 'dark', currency: 'USD' },
    }
  }

  return {
    layouts, active, editMode,
    init, reset, setEditMode, currentLayout, currentWidgets,
    updateWidgets, addWidget, toggleWidget, isWidgetVisible, updateWidgetSettings,
  }
})
