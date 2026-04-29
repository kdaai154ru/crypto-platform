<!-- apps/frontend/components/dashboard/SymbolSelector.vue -->
<!-- Global selector: reads/writes symbolStore directly, no v-model prop -->
<template>
  <div class="sym-selector" ref="rootEl">
    <!-- Trigger: use pointerdown.stop so we own the event before
         the document-level outside-click handler sees it -->
    <button
      class="sym-trigger"
      @pointerdown.stop="handleTriggerPointer"
      @click.stop
    >
      <span class="sym-badge">{{ activeSymbol }}</span>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
           stroke="currentColor" stroke-width="1.5">
        <path d="M2 4l4 4 4-4"/>
      </svg>
    </button>

    <!-- Dropdown teleported to body to avoid toolbar overflow clipping -->
    <Teleport to="body">
      <div v-if="isOpen" class="sym-dropdown" :style="dropdownPos">
        <!-- Search -->
        <div class="sym-search-wrap">
          <input
            ref="searchEl"
            v-model="query"
            class="sym-search"
            placeholder="Search…"
            @keydown.escape="close"
            @keydown.enter.prevent="selectFirst"
            @keydown.arrow-down.prevent="moveDown"
            @keydown.arrow-up.prevent="moveUp"
          />
        </div>

        <!-- Categories -->
        <div class="sym-cats">
          <button
            v-for="cat in Object.keys(SYMBOL_LIST)" :key="cat"
            :class="['sym-cat', activeCat === cat && 'active']"
            @click="activeCat = cat"
          >{{ cat }}</button>
        </div>

        <!-- List -->
        <div class="sym-list" ref="listEl">
          <button
            v-for="(s, i) in filtered" :key="s"
            :class="['sym-item', s === activeSymbol && 'selected', i === cursor && 'focused']"
            @click="select(s)"
            @mouseenter="cursor = i"
          >
            <span class="sym-name">{{ s }}</span>
            <svg v-if="s === activeSymbol" width="10" height="10" viewBox="0 0 12 12"
                 fill="none" stroke="var(--color-primary)" stroke-width="2">
              <polyline points="2 6 5 9 10 3"/>
            </svg>
          </button>
          <div v-if="!filtered.length" class="sym-empty">Не найдено</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSymbolStore, SYMBOL_LIST } from '~/stores/symbol.store'

const symbolStore = useSymbolStore()
const { activeSymbol } = storeToRefs(symbolStore)

const isOpen    = ref(false)
const query     = ref('')
const activeCat = ref('All')
const cursor    = ref(0)
const rootEl    = ref<HTMLElement | null>(null)
const searchEl  = ref<HTMLInputElement | null>(null)
const listEl    = ref<HTMLElement | null>(null)
const dropdownPos = ref<Record<string, string>>({})

const filtered = computed(() => {
  const pool = SYMBOL_LIST[activeCat.value] ?? SYMBOL_LIST.All
  if (!query.value) return pool!
  const q = query.value.toLowerCase()
  return pool!.filter(s => s.toLowerCase().includes(q))
})

function calcPos() {
  const rect = rootEl.value?.getBoundingClientRect()
  if (!rect) return
  dropdownPos.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    zIndex: '9999',
  }
}

// FIX 1: use pointerdown.stop on trigger — we call toggle() here and
// stop propagation so the document pointerdown outside-handler never
// sees this event. The old pattern (mousedown on document + click on
// button) caused: mousedown→outside-handler runs first (noop since
// closed) → click→toggle opens → but on SECOND click: dropdown is
// open → mousedown→outside-handler CLOSES it → click→toggle sees
// isOpen=false → calls open() again → flicker / no effect.
function handleTriggerPointer(e: PointerEvent) {
  e.stopPropagation()
  isOpen.value ? close() : open()
}

function open() {
  calcPos()
  isOpen.value = true
  query.value  = ''
  cursor.value = 0
  nextTick(() => searchEl.value?.focus())
}

function close() { isOpen.value = false }

function select(s: string) {
  symbolStore.setSymbol(s)
  close()
}

function selectFirst() {
  if (filtered.value.length) select(filtered.value[0]!)
}

function moveDown() {
  cursor.value = Math.min(cursor.value + 1, filtered.value.length - 1)
  scrollCursor()
}

function moveUp() {
  cursor.value = Math.max(cursor.value - 1, 0)
  scrollCursor()
}

function scrollCursor() {
  nextTick(() => {
    const item = listEl.value?.children[cursor.value] as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  })
}

watch(filtered, () => { cursor.value = 0 })

// FIX 2: outside-click now uses pointerdown (consistent with trigger)
// The dropdown is teleported to body — clicks inside it must NOT close.
function onOutside(e: PointerEvent) {
  // rootEl = trigger button area
  if (rootEl.value?.contains(e.target as Node)) return
  // Check if click is inside the teleported dropdown
  const dropdown = document.querySelector('.sym-dropdown')
  if (dropdown?.contains(e.target as Node)) return
  close()
}

// FIX 3: recalculate position on scroll/resize so dropdown doesn't drift
function onScrollOrResize() {
  if (isOpen.value) calcPos()
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
  window.addEventListener('resize', onScrollOrResize, { passive: true })
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})
</script>

<style>
/* NOT scoped — dropdown is teleported to body */
.sym-dropdown {
  width: 220px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.sym-search-wrap { padding: 8px 8px 4px; }
.sym-search {
  width: 100%; padding: 5px 8px;
  background: var(--color-surface-offset);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text); font-size: 12px;
  outline: none;
}
.sym-search:focus { border-color: var(--color-primary); }

.sym-cats {
  display: flex; gap: 2px; padding: 4px 8px;
  border-bottom: 1px solid var(--color-divider);
  flex-wrap: wrap;
}
.sym-cat {
  padding: 2px 7px; border-radius: 9999px;
  font-size: 11px; color: var(--color-text-muted);
  cursor: pointer; border: 1px solid transparent;
  transition: all 120ms; background: transparent;
}
.sym-cat:hover  { color: var(--color-text); background: var(--color-surface-offset); }
.sym-cat.active { color: var(--color-primary); border-color: var(--color-primary); background: var(--color-primary-highlight); }

.sym-list { max-height: 200px; overflow-y: auto; padding: 4px 0; }

.sym-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 5px 12px;
  font-size: 12px; color: var(--color-text-muted);
  cursor: pointer; background: transparent; border: none;
  transition: background 100ms, color 100ms; text-align: left;
}
.sym-item:hover, .sym-item.focused { background: var(--color-surface-offset); color: var(--color-text); }
.sym-item.selected { color: var(--color-primary); font-weight: 600; }

.sym-name { font-variant-numeric: tabular-nums; }

.sym-empty {
  padding: 12px; text-align: center;
  color: var(--color-text-faint); font-size: 12px;
}
</style>

<style scoped>
.sym-selector { position: relative; display: inline-flex; }

.sym-trigger {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-offset);
  color: var(--color-text);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: border-color 150ms;
}
.sym-trigger:hover { border-color: var(--color-primary); }

.sym-badge { font-weight: 700; color: var(--color-primary); letter-spacing: .02em; }
</style>
