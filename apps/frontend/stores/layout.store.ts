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

  // Явный setter — не мутируем ref напрямую из шаблонов/компонентов.
  function setEditMode(val: boolean) {
    editMode.value = val
  }

  function currentLayout(): DashboardLayout | undefined {
    return layouts.value.find(l => l.id === active.value)
  }

  function currentWidgets(): WidgetLayout[] {
    return currentLayout()?.breakpoints.lg ?? []
  }

  // Единственная точка записи в breakpoints.lg.
  // Заменяем весь массив новым → Vue 3 гарантированно видит изменение.
  function updateWidgets(lg: WidgetLayout[]) {
    const cur = currentLayout()
    if (!cur) return
    // Иммутабельная замена массива — триггерит реактивность без $patch
    cur.breakpoints.lg = [...lg]
    cur.updatedAt      = Date.now()
    save(layouts.value)
  }

  function toggleWidget(
    type: string,
    def: Omit<WidgetLayout, 'i' | 'x' | 'y' | 'visible'>,
  ) {
    const cur = currentLayout()
    if (!cur) return

    const existing = cur.breakpoints.lg.find(it => it.type === type)
    if (existing) {
      // Иммутабельное обновление: создаём новый массив с новым объектом виджета.
      // Прямая мутация existing.visible НЕ гарантирует триггер реактивности
      // при доступе через .find() в Vue 3 Pinia setup-store.
      const updated = cur.breakpoints.lg.map(it =>
        it.i === existing.i ? { ...it, visible: !it.visible } : it,
      )
      updateWidgets(updated)
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
      updateWidgets([...cur.breakpoints.lg, newWidget])
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
    // Иммутабельное обновление settings
    const updated = cur.breakpoints.lg.map(w =>
      w.i === widgetId
        ? { ...w, settings: { ...(w.settings ?? {}), ...patch } }
        : w,
    )
    updateWidgets(updated)
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
    updateWidgets, toggleWidget, isWidgetVisible, updateWidgetSettings,
  }
})
