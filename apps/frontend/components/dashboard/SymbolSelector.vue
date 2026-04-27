<!-- apps/frontend/components/dashboard/SymbolSelector.vue -->
<template>
  <div class="sym-selector" :class="{ open: isOpen }" ref="rootEl">
    <!-- Trigger -->
    <button class="sym-trigger" @click="toggle">
      <span class="sym-badge">{{ modelValue }}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M2 4l4 4 4-4"/>
      </svg>
    </button>

    <!-- Dropdown -->
    <Teleport to="body">
      <div v-if="isOpen" class="sym-dropdown" :style="dropdownStyle">
        <!-- Search -->
        <div class="sym-search-wrap">
          <input
            ref="searchEl"
            v-model="query"
            class="sym-search"
            placeholder="Search symbol…"
            @keydown.escape="close"
            @keydown.enter="selectFirst"
            @keydown.arrow-down.prevent="moveDown"
            @keydown.arrow-up.prevent="moveUp"
          />
        </div>

        <!-- Categories -->
        <div class="sym-cats">
          <button
            v-for="cat in CATEGORIES" :key="cat"
            :class="['sym-cat', activeCat === cat && 'active']"
            @click="activeCat = cat"
          >{{ cat }}</button>
        </div>

        <!-- List -->
        <div class="sym-list" ref="listEl">
          <button
            v-for="(s, i) in filtered" :key="s"
            :class="['sym-item', s === modelValue && 'selected', i === cursor && 'focused']"
            @click="select(s)"
            @mouseenter="cursor = i"
          >
            <span class="sym-name">{{ s }}</span>
            <span class="sym-check" v-if="s === modelValue">✓</span>
          </button>
          <div v-if="!filtered.length" class="sym-empty">No results</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit  = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const SYMBOLS: Record<string, string[]> = {
  All: [
    'BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT',
    'DOGE/USDT','ADA/USDT','AVAX/USDT','LINK/USDT','DOT/USDT',
    'MATIC/USDT','UNI/USDT','LTC/USDT','ATOM/USDT','NEAR/USDT',
    'FIL/USDT','APT/USDT','OP/USDT','ARB/USDT','SUI/USDT',
  ],
  Majors:  ['BTC/USDT','ETH/USDT','BNB/USDT','XRP/USDT','SOL/USDT'],
  DeFi:    ['UNI/USDT','LINK/USDT','AAVE/USDT','CRV/USDT','MKR/USDT'],
  L2:      ['MATIC/USDT','OP/USDT','ARB/USDT','IMX/USDT','MANTA/USDT'],
  Memes:   ['DOGE/USDT','SHIB/USDT','PEPE/USDT','WIF/USDT','BONK/USDT'],
}

const CATEGORIES = Object.keys(SYMBOLS)

const isOpen    = ref(false)
const query     = ref('')
const activeCat = ref('All')
const cursor    = ref(0)
const rootEl    = ref<HTMLElement|null>(null)
const searchEl  = ref<HTMLInputElement|null>(null)
const listEl    = ref<HTMLElement|null>(null)
const dropdownStyle = ref({} as Record<string,string>)

const filtered = computed(() => {
  const pool = SYMBOLS[activeCat.value] ?? SYMBOLS.All
  if (!query.value) return pool
  const q = query.value.toLowerCase()
  return pool.filter(s => s.toLowerCase().includes(q))
})

function toggle() { isOpen.value ? close() : open() }

function open() {
  isOpen.value = true
  query.value  = ''
  cursor.value = 0
  positionDropdown()
  nextTick(() => searchEl.value?.focus())
}

function close() { isOpen.value = false }

function select(s: string) {
  emit('update:modelValue', s)
  close()
}

function selectFirst() {
  if (filtered.value.length) select(filtered.value[0])
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

function positionDropdown() {
  const rect = rootEl.value?.getBoundingClientRect()
  if (!rect) return
  dropdownStyle.value = {
    top:  `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
  }
}

// Сброс cursor при фильтрации
watch(filtered, () => { cursor.value = 0 })

// Клик вне — закрыть
function onOutside(e: MouseEvent) {
  if (!rootEl.value?.contains(e.target as Node)) close()
}

onMounted(()  => document.addEventListener('mousedown', onOutside))
onUnmounted(()=> document.removeEventListener('mousedown', onOutside))
</script>

<style scoped>
.sym-selector { position: relative; display: inline-flex; }

.sym-trigger {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 8px; border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text); cursor: pointer;
  font-size: var(--text-xs); transition: border-color 150ms;
}
.sym-trigger:hover { border-color: var(--color-primary); }
.open .sym-trigger  { border-color: var(--color-primary); }

.sym-badge { font-weight: 600; letter-spacing: .02em; color: var(--color-primary); }

/* Dropdown — fixed поверх всего */
.sym-dropdown {
  position: fixed; z-index: 9999;
  width: 240px;
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
  color: var(--color-text); font-size: var(--text-xs);
  outline: none;
}
.sym-search:focus { border-color: var(--color-primary); }

.sym-cats {
  display: flex; gap: 2px; padding: 4px 8px;
  border-bottom: 1px solid var(--color-divider);
  flex-wrap: wrap;
}
.sym-cat {
  padding: 2px 7px; border-radius: var(--radius-full);
  font-size: 11px; color: var(--color-text-muted);
  cursor: pointer; border: 1px solid transparent;
  transition: all 120ms;
}
.sym-cat:hover  { color: var(--color-text); background: var(--color-surface-offset); }
.sym-cat.active { color: var(--color-primary); border-color: var(--color-primary); background: var(--color-primary-highlight); }

.sym-list { max-height: 220px; overflow-y: auto; padding: 4px 0; }

.sym-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 5px 12px;
  font-size: var(--text-xs); color: var(--color-text-muted);
  cursor: pointer; background: transparent; border: none;
  transition: background 100ms, color 100ms; text-align: left;
}
.sym-item:hover, .sym-item.focused { background: var(--color-surface-offset); color: var(--color-text); }
.sym-item.selected { color: var(--color-primary); font-weight: 600; }

.sym-name   { font-variant-numeric: tabular-nums; }
.sym-check  { color: var(--color-primary); font-size: 10px; }

.sym-empty { padding: 12px; text-align: center; color: var(--color-text-faint); font-size: var(--text-xs); }
</style>
