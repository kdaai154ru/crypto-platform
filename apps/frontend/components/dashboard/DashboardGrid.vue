<!-- apps/frontend/components/dashboard/DashboardGrid.vue -->
<template>
  <div class="dashboard-root">
    <DashboardToolbar />
    <DashboardStatusBar />
    <div class="dashboard-main">
      <div v-if="ready" class="dash-grid">
        <div
          v-for="item in gridItems"
          :key="item.i"
          class="dash-cell"
          :style="cellStyle(item)"
        >
          <DashboardWidgetContainer :item="item" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, onMounted } from 'vue'
import { useLayoutStore } from '~/stores/layout.store'
import type { WidgetLayout } from '@crypto-platform/types'

const layoutStore = useLayoutStore()
const editMode    = ref(false)
const ready       = ref(false)

const gridItems = computed<WidgetLayout[]>(
  () => layoutStore.currentLayout()?.breakpoints.lg ?? []
)

const ROW_H = 80   // px per row unit
const GAP   = 6    // px

function cellStyle(item: WidgetLayout) {
  return {
    gridColumn:  `${item.x + 1} / span ${item.w}`,
    gridRow:     `${item.y + 1} / span ${item.h}`,
    minHeight:   `${item.h * ROW_H + (item.h - 1) * GAP}px`,
  }
}

provide('editMode', editMode)
onMounted(() => { layoutStore.init(); ready.value = true })
</script>