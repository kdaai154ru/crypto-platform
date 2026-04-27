<!-- apps/frontend/components/dashboard/DashboardGrid.vue -->
<template>
  <div class="dashboard-root">
    <DashboardToolbar />
    <DashboardStatusBar />
    <div class="dashboard-main">
      <!-- outer wrapper всегда в DOM — gridRef получает ширину сразу -->
      <div class="dash-grid-wrapper" ref="gridRef">
        <div v-if="ready" class="native-grid" :style="gridStyle">

          <!-- Ghost placeholder при drag/resize -->
          <div
            v-if="ghost"
            class="grid-ghost"
            :style="cellStyle(ghost.x, ghost.y, ghost.w, ghost.h)"
          />

          <div
            v-for="item in visibleItems"
            :key="item.i"
            class="grid-cell"
            :class="{
              'is-edit':     layoutStore.editMode,
              'is-dragging': drag?.id === item.i,
              'is-resizing': resize?.id === item.i,
            }"
            :style="activeCellStyle(item)"
          >
            <DashboardWidgetContainer
              :item="item"
              :edit-mode="layoutStore.editMode"
              @drag-start="(e: MouseEvent) => startDrag(e, item.i)"
              @resize-start="(e: MouseEvent) => startResize(e, item.i)"
            />
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useLayoutStore } from '~/stores/layout.store'
import type { WidgetLayout } from '@crypto-platform/types'

const layoutStore = useLayoutStore()
const ready       = ref(false)
// gridRef — на внешнем div, который ВСЕГДА в DOM (v-if убран с него)
const gridRef     = ref<HTMLElement | null>(null)

// Сетка: 12 колонок, высота строки 80px, зазор 6px
const COLS  = 12
const ROW_H = 80
const GAP   = 6
const MIN_W = 2
const MIN_H = 2

// Реальная ширина контейнера — обновляется через ResizeObserver
const containerW = ref(0)
let ro: ResizeObserver | null = null

// ─── Типы состояния drag/resize ───────────────────────────────────────────────
interface DragState {
  id: string
  startMouseX: number; startMouseY: number
  origX: number; origY: number
  origW: number; origH: number
  colW: number
}
interface ResizeState {
  id: string
  startMouseX: number; startMouseY: number
  origW: number; origH: number
  origX: number; origY: number
  colW: number
}
interface GhostRect { x: number; y: number; w: number; h: number }

const drag   = ref<DragState | null>(null)
const resize = ref<ResizeState | null>(null)
const ghost  = ref<GhostRect | null>(null)

// ─── Данные сетки ─────────────────────────────────────────────────────────────
const visibleItems = computed<WidgetLayout[]>(() =>
  (layoutStore.currentLayout()?.breakpoints.lg ?? []).filter(w => w.visible !== false)
)

const gridStyle = computed(() => {
  // Учитываем ghost при расчёте высоты — чтобы сетка растягивалась во время drag
  const fromStore = visibleItems.value.reduce((m, w) => Math.max(m, w.y + w.h), 0)
  const fromGhost = ghost.value ? ghost.value.y + ghost.value.h : 0
  const rows = Math.max(fromStore, fromGhost)
  return {
    position: 'relative' as const,
    width:    '100%',
    height:   `${rows * (ROW_H + GAP) + GAP}px`,
  }
})

// ─── Вычисление ширины колонки ────────────────────────────────────────────────
function getColW(): number {
  const w = containerW.value > 0
    ? containerW.value
    : (gridRef.value?.clientWidth ?? 1200)
  return (w - GAP * (COLS + 1)) / COLS
}

// ─── CSS: ячейка → абсолютное позиционирование ───────────────────────────────
function cellStyle(x: number, y: number, w: number, h: number) {
  const colW = getColW()
  return {
    position:  'absolute' as const,
    left:      `${GAP + x * (colW + GAP)}px`,
    top:       `${GAP + y * (ROW_H + GAP)}px`,
    width:     `${w * colW + (w - 1) * GAP}px`,
    height:    `${h * ROW_H + (h - 1) * GAP}px`,
    transition: (drag.value || resize.value)
      ? 'none'
      : 'left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease',
  }
}

// ─── Стиль ячейки: во время drag/resize показываем позицию ghost ──────────────
// Это ключевое исправление: без него виджет стоит на месте пока тащишь
function activeCellStyle(item: WidgetLayout) {
  const isDragging = drag.value?.id  === item.i
  const isResizing = resize.value?.id === item.i
  if ((isDragging || isResizing) && ghost.value) {
    return cellStyle(ghost.value.x, ghost.value.y, ghost.value.w, ghost.value.h)
  }
  return cellStyle(item.x, item.y, item.w, item.h)
}

// ─── Snap px → grid-unit ──────────────────────────────────────────────────────
function snapX(px: number, colW: number): number {
  return Math.max(0, Math.min(COLS - 1, Math.round(px / (colW + GAP))))
}
function snapY(px: number): number {
  return Math.max(0, Math.round(px / (ROW_H + GAP)))
}
function snapW(px: number, colW: number): number {
  return Math.max(MIN_W, Math.round((px + GAP) / (colW + GAP)))
}
function snapH(px: number): number {
  return Math.max(MIN_H, Math.round((px + GAP) / (ROW_H + GAP)))
}

// ─── Коллизии: сдвигаем перекрывающиеся виджеты вниз ─────────────────────────
function resolveCollisions(items: WidgetLayout[], moved: WidgetLayout): WidgetLayout[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const result: WidgetLayout[] = []
  for (const item of sorted) {
    if (item.i === moved.i) { result.push(moved); continue }
    let placed = { ...item }
    let loop   = 0
    while (loop++ < 50) {
      const overlap = result.find(r => overlaps(r, placed) && r.i !== placed.i)
      if (!overlap) break
      placed = { ...placed, y: overlap.y + overlap.h }
    }
    result.push(placed)
  }
  return result
}

function overlaps(a: WidgetLayout, b: WidgetLayout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// ─── Drag start ───────────────────────────────────────────────────────────────
function startDrag(e: MouseEvent, id: string) {
  if (!layoutStore.editMode) return
  const item = visibleItems.value.find(w => w.i === id)
  if (!item) return
  e.preventDefault()
  const colW = getColW()
  drag.value = {
    id,
    startMouseX: e.clientX, startMouseY: e.clientY,
    origX: item.x,  origY: item.y,
    origW: item.w,  origH: item.h,
    colW,
  }
  ghost.value = { x: item.x, y: item.y, w: item.w, h: item.h }
  document.body.style.cursor     = 'grabbing'
  document.body.style.userSelect = 'none'
}

// ─── Resize start ─────────────────────────────────────────────────────────────
function startResize(e: MouseEvent, id: string) {
  if (!layoutStore.editMode) return
  const item = visibleItems.value.find(w => w.i === id)
  if (!item) return
  e.preventDefault()
  e.stopPropagation()
  const colW = getColW()
  resize.value = {
    id,
    startMouseX: e.clientX, startMouseY: e.clientY,
    origW: item.w,  origH: item.h,
    origX: item.x,  origY: item.y,
    colW,
  }
  ghost.value = { x: item.x, y: item.y, w: item.w, h: item.h }
  document.body.style.cursor     = 'se-resize'
  document.body.style.userSelect = 'none'
}

// ─── Mouse move ───────────────────────────────────────────────────────────────
function onMouseMove(e: MouseEvent) {
  if (drag.value) {
    const d   = drag.value
    const dx  = e.clientX - d.startMouseX
    const dy  = e.clientY - d.startMouseY
    const newX = snapX(d.origX * (d.colW + GAP) + dx, d.colW)
    const newY = snapY(d.origY * (ROW_H + GAP) + dy)
    const newW = Math.min(d.origW, COLS - newX)
    ghost.value = { x: newX, y: newY, w: newW, h: d.origH }
  } else if (resize.value) {
    const r   = resize.value
    const dx  = e.clientX - r.startMouseX
    const dy  = e.clientY - r.startMouseY
    const newW = Math.min(
      snapW(r.origW * (r.colW + GAP) - GAP + dx, r.colW),
      COLS - r.origX,
    )
    const newH = snapH(r.origH * (ROW_H + GAP) - GAP + dy)
    ghost.value = { x: r.origX, y: r.origY, w: newW, h: newH }
  }
}

// ─── Mouse up: фиксируем новое положение ─────────────────────────────────────
function onMouseUp() {
  if (!drag.value && !resize.value) return

  const cur = layoutStore.currentLayout()
  const g   = ghost.value
  const id  = drag.value?.id ?? resize.value?.id

  if (cur && id && g) {
    const updated  = cur.breakpoints.lg.map(w =>
      w.i === id ? { ...w, x: g.x, y: g.y, w: g.w, h: g.h } : w
    )
    const movedItem = updated.find(w => w.i === id)!
    const resolved  = resolveCollisions(updated, movedItem)
    layoutStore.updateWidgets(resolved)
  }

  drag.value   = null
  resize.value = null
  ghost.value  = null

  document.body.style.cursor     = ''
  document.body.style.userSelect = ''
}

onMounted(async () => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup',   onMouseUp)

  layoutStore.init()

  // gridRef теперь на внешнем div (всегда в DOM) — можно измерить сразу
  await nextTick()

  if (gridRef.value) {
    const w = gridRef.value.clientWidth
    if (w > 0) containerW.value = w

    ro = new ResizeObserver(entries => {
      const cw = entries[0]?.contentRect.width
      if (cw && cw > 0) containerW.value = cw
    })
    ro.observe(gridRef.value)
  }

  ready.value = true
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup',   onMouseUp)
  ro?.disconnect()
  document.body.style.cursor     = ''
  document.body.style.userSelect = ''
})
</script>

<style>
.grid-ghost {
  background:    var(--color-primary);
  opacity:       0.12;
  border-radius: var(--radius-md);
  border:        2px dashed var(--color-primary);
  pointer-events: none;
  z-index: 0;
}
.grid-cell {
  z-index: 1;
  cursor: default;
}
.grid-cell.is-dragging,
.grid-cell.is-resizing {
  z-index:  100;
  opacity:  0.85;
  /* виджет двигается без transition пока тащим (transition=none стоит в activeCellStyle) */
}
</style>

<style scoped>
.dashboard-root {
  display:        flex;
  flex-direction: column;
  height:         100vh;
  overflow:       hidden;
}
.dashboard-main {
  flex:       1;
  overflow-y: auto;
  overflow-x: hidden;
}
.dash-grid-wrapper {
  padding:     0;
  user-select: none;
  /* min-height нужен чтобы ResizeObserver сразу получил ненулевую ширину */
  min-height:  4px;
}
</style>
