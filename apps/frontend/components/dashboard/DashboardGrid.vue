<!-- apps/frontend/components/dashboard/DashboardGrid.vue -->
<template>
  <div class="dashboard-root">
    <DashboardToolbar />
    <DashboardStatusBar />
    <div class="dashboard-main">
      <div v-if="ready" class="dash-grid-wrapper">
        <grid-layout
          v-model:layout="gridLayout"
          :col-num="24"
          :row-height="ROW_H"
          :margin="[GAP, GAP]"
          :is-draggable="editMode"
          :is-resizable="editMode"
          :use-css-transforms="true"
          :auto-size="true"
          :vertical-compact="true"
          @layout-updated="onLayoutUpdated"
        >
          <grid-item
            v-for="item in gridLayout"
            :key="item.i"
            :x="item.x"
            :y="item.y"
            :w="item.w"
            :h="item.h"
            :i="item.i"
            :min-w="2"
            :min-h="2"
            drag-allow-from=".widget-drag-handle"
          >
            <DashboardWidgetContainer :item="toWidgetLayout(item)" :edit-mode="editMode" />
          </grid-item>
        </grid-layout>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide, onMounted } from 'vue'
import { GridLayout, GridItem } from 'vue-grid-layout'
import { useLayoutStore } from '~/stores/layout.store'
import type { WidgetLayout } from '@crypto-platform/types'

const layoutStore = useLayoutStore()
const editMode    = ref(false)
const ready       = ref(false)

const ROW_H = 80
const GAP   = 6

// vue-grid-layout работает с плоским массивом { i, x, y, w, h }
const gridLayout = ref<Array<{ i: string; x: number; y: number; w: number; h: number }>>( [])

function buildGrid() {
  const widgets = layoutStore.currentLayout()?.breakpoints.lg ?? []
  gridLayout.value = widgets
    .filter(w => w.visible !== false)
    .map(w => ({ i: w.i, x: w.x, y: w.y, w: w.w, h: w.h }))
}

// При изменении стора (например toggle widget) — перестраиваем grid
const storeWidgets = computed(() =>
  (layoutStore.currentLayout()?.breakpoints.lg ?? []).filter(w => w.visible !== false)
)
watch(storeWidgets, buildGrid, { deep: true })

// После drag/resize vue-grid-layout вызывает этот хук — сохраняем позиции в store
function onLayoutUpdated(newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) {
  const cur = layoutStore.currentLayout()
  if (!cur) return
  cur.breakpoints.lg = cur.breakpoints.lg.map(w => {
    const g = newLayout.find(n => n.i === w.i)
    return g ? { ...w, x: g.x, y: g.y, w: g.w, h: g.h } : w
  })
  // сохраняем через store
  layoutStore.updateWidgets(cur.breakpoints.lg)
}

// Конвертируем запись grid обратно в WidgetLayout (c type, visible, settings)
function toWidgetLayout(g: { i: string }): WidgetLayout {
  return (
    layoutStore.currentLayout()?.breakpoints.lg.find(w => w.i === g.i)
    ?? { i: g.i, type: 'market-overview', x: 0, y: 0, w: 4, h: 4, visible: true }
  )
}

provide('editMode', editMode)
onMounted(() => { layoutStore.init(); buildGrid(); ready.value = true })
</script>

<style>
/* Глобальные стили для vue-grid-layout */
.vue-grid-layout {
  background: transparent;
}

.vue-grid-item {
  transition: none;
  background: transparent;
}

.vue-grid-item.vue-grid-placeholder {
  background: var(--color-primary);
  opacity: 0.15;
  border-radius: var(--radius-md);
  border: 2px dashed var(--color-primary);
}

/* ручка resize в углу */
.vue-grid-item .vue-resizable-handle {
  bottom: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='M11 5L5 11M14 8L8 14M14 11L11 14' stroke='%234f98a3' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0;
  transition: opacity 150ms;
}

.vue-grid-item:hover .vue-resizable-handle,
.vue-grid-item.resizing .vue-resizable-handle {
  opacity: 1;
}
</style>

<style scoped>
.dashboard-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.dashboard-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.dash-grid-wrapper {
  padding: var(--space-2);
}
</style>
