<!-- apps/frontend/components/dashboard/SymbolSelector.vue -->
<!-- Global selector: Spot/Perp tabs, all USDT pairs, search, favorites -->
<template>
  <div class="sym-selector" ref="rootEl">
    <!-- Trigger -->
    <button class="sym-trigger" @pointerdown.stop="handleTriggerPointer" @click.stop>
      <!-- Market type badge -->
      <span :class="['sym-mtype', marketType]">{{ marketType === 'spot' ? 'S' : 'P' }}</span>
      <span class="sym-badge">{{ displaySymbol }}</span>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
           stroke="currentColor" stroke-width="1.5">
        <path d="M2 4l4 4 4-4"/>
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="sym-dropdown" :style="dropdownPos">

        <!-- Spot / Perp tabs -->
        <div class="sym-mtype-tabs">
          <button :class="['sym-mtype-tab', marketType === 'spot' && 'active']"
                  @click="setMarket('spot')">Spot</button>
          <button :class="['sym-mtype-tab', marketType === 'perp' && 'active']"
                  @click="setMarket('perp')">Perp</button>
          <span class="sym-count">{{ currentList.length }} pairs</span>
        </div>

        <!-- Search -->
        <div class="sym-search-wrap">
          <input
            ref="searchEl"
            v-model="query"
            class="sym-search"
            placeholder="Search BTC, ETH…"
            @keydown.escape="close"
            @keydown.enter.prevent="selectFirst"
            @keydown.arrow-down.prevent="moveDown"
            @keydown.arrow-up.prevent="moveUp"
          />
        </div>

        <!-- Category pills -->
        <div class="sym-cats">
          <button
            v-for="cat in CAT_TABS" :key="cat"
            :class="['sym-cat', activeCat === cat && 'active']"
            @click="activeCat = cat"
          >
            <span v-if="cat === 'Favorites'">&#9733;</span>
            {{ cat }}
          </button>
        </div>

        <!-- Loading indicator -->
        <div v-if="loading" class="sym-loading">
          <span class="sym-spinner" />
          Loading pairs…
        </div>

        <!-- List -->
        <div v-else class="sym-list" ref="listEl">
          <div v-if="!filtered.length" class="sym-empty">Not found</div>
          <button
            v-for="(s, i) in filtered" :key="s"
            :class="['sym-item', normalizeSymbol(s) === normalizeSymbol(activeSymbol) && 'selected', i === cursor && 'focused']"
            @click="select(s)"
            @mouseenter="cursor = i"
          >
            <span class="sym-name">{{ formatDisplay(s) }}</span>
            <span class="sym-item-right">
              <button class="sym-fav" :title="isFavorite(s) ? 'Remove from favorites' : 'Add to favorites'"
                      @click.stop="toggleFavorite(s)">
                <span :class="isFavorite(s) ? 'fav-on' : 'fav-off'">&#9733;</span>
              </button>
              <svg v-if="normalizeSymbol(s) === normalizeSymbol(activeSymbol)"
                   width="10" height="10" viewBox="0 0 12 12"
                   fill="none" stroke="var(--color-primary)" stroke-width="2">
                <polyline points="2 6 5 9 10 3"/>
              </svg>
            </span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import {
  useSymbolStore, loadSpotSymbols, loadPerpSymbols,
  spotSymbols, perpSymbols, type MarketType,
} from '~/stores/symbol.store'
import { CATEGORIES, allSymbols } from '~/composables/useSymbolSearch'

const symbolStore = useSymbolStore()
const { activeSymbol, marketType } = storeToRefs(symbolStore)

const isOpen    = ref(false)
const query     = ref('')
const activeCat = ref<string>('All')
const cursor    = ref(0)
const loading   = ref(false)
const rootEl    = ref<HTMLElement | null>(null)
const searchEl  = ref<HTMLInputElement | null>(null)
const listEl    = ref<HTMLElement | null>(null)
const dropdownPos = ref<Record<string, string>>({})

const CAT_TABS = ['All', 'Favorites', ...Object.keys(CATEGORIES)]

// Current symbols list based on marketType
const currentList = computed(() => {
  if (marketType.value === 'perp') {
    return perpSymbols.value.length > 0
      ? perpSymbols.value
      : allSymbols.value.length > 0 ? allSymbols.value : []
  }
  return spotSymbols.value.length > 0
    ? spotSymbols.value
    : allSymbols.value.length > 0 ? allSymbols.value : []
})

// Strip /USDT or USDT for display
function formatDisplay(s: string): string {
  return s.replace('/USDT', '').replace('USDT', '') + '/USDT'
}
// Normalize to BTCUSDT for comparison
function normalizeSymbol(s: string): string {
  return s.replace('/', '')
}

// Display in trigger: BTC/USDT
const displaySymbol = computed(() => formatDisplay(activeSymbol.value))

const filtered = computed(() => {
  let list = currentList.value

  // Category filter
  if (activeCat.value === 'Favorites') {
    list = symbolStore.favorites.filter(f =>
      list.some(s => normalizeSymbol(s) === normalizeSymbol(f))
    )
  } else if (activeCat.value !== 'All') {
    const tags = CATEGORIES[activeCat.value] ?? []
    list = list.filter(s => {
      const base = s.replace('/USDT', '').replace('USDT', '')
      return tags.includes(base)
    })
  }

  // Text search
  const q = query.value.trim().toUpperCase()
  if (q) {
    list = list.filter(s => {
      const norm = s.replace('/', '')
      return norm.includes(q) || norm.replace('USDT', '').includes(q)
    })
  }

  return list.slice(0, 200) // virtual scroll: показываем первые 200
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

async function setMarket(m: MarketType) {
  symbolStore.setMarketType(m)
  activeCat.value = 'All'
  query.value = ''
  cursor.value = 0
  await loadForCurrentMarket()
}

async function loadForCurrentMarket() {
  if (marketType.value === 'perp' && perpSymbols.value.length === 0) {
    loading.value = true
    await loadPerpSymbols()
    loading.value = false
  } else if (marketType.value === 'spot' && spotSymbols.value.length === 0) {
    loading.value = true
    await loadSpotSymbols()
    loading.value = false
  }
}

function handleTriggerPointer(e: PointerEvent) {
  e.stopPropagation()
  isOpen.value ? close() : open()
}

async function open() {
  calcPos()
  isOpen.value = true
  query.value  = ''
  cursor.value = 0
  nextTick(() => searchEl.value?.focus())
  await loadForCurrentMarket()
}

function close() { isOpen.value = false }

function select(s: string) {
  // Store as BTCUSDT internally, display as BTC/USDT
  const normalized = normalizeSymbol(s)
  symbolStore.setSymbol(normalized.replace('USDT', '/USDT'))
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

function toggleFavorite(sym: string) {
  symbolStore.toggleFavorite(normalizeSymbol(sym))
}
function isFavorite(sym: string) {
  return symbolStore.isFavorite(normalizeSymbol(sym))
}

watch(filtered, () => { cursor.value = 0 })
watch(marketType, () => { activeCat.value = 'All'; query.value = '' })

function onOutside(e: PointerEvent) {
  if (rootEl.value?.contains(e.target as Node)) return
  const dropdown = document.querySelector('.sym-dropdown')
  if (dropdown?.contains(e.target as Node)) return
  close()
}

function onScrollOrResize() {
  if (isOpen.value) calcPos()
}

onMounted(() => {
  // Prefetch spot symbols in background
  loadSpotSymbols()
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
  width: 260px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 420px;
}

/* Spot / Perp tabs */
.sym-mtype-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px 4px;
  border-bottom: 1px solid var(--color-divider);
}
.sym-mtype-tab {
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  transition: all 120ms;
}
.sym-mtype-tab:hover { color: var(--color-text); border-color: var(--color-text-muted); }
.sym-mtype-tab.active { color: var(--color-primary); border-color: var(--color-primary); background: var(--color-primary-highlight); }
.sym-count { margin-left: auto; font-size: 10px; color: var(--color-text-faint); }

.sym-search-wrap { padding: 6px 8px 2px; }
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
  flex-wrap: wrap; overflow-x: auto; flex-shrink: 0;
}
.sym-cat {
  padding: 2px 7px; border-radius: 9999px;
  font-size: 10px; color: var(--color-text-muted);
  cursor: pointer; border: 1px solid transparent;
  transition: all 120ms; background: transparent; white-space: nowrap;
}
.sym-cat:hover  { color: var(--color-text); background: var(--color-surface-offset); }
.sym-cat.active { color: var(--color-primary); border-color: var(--color-primary); background: var(--color-primary-highlight); }

.sym-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 12px; font-size: 11px; color: var(--color-text-faint);
}
.sym-spinner {
  width: 14px; height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: sym-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes sym-spin { to { transform: rotate(360deg); } }

.sym-list { flex: 1; overflow-y: auto; padding: 4px 0; min-height: 0; }

.sym-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 5px 12px;
  font-size: 12px; color: var(--color-text-muted);
  cursor: pointer; background: transparent; border: none;
  transition: background 80ms, color 80ms; text-align: left;
}
.sym-item:hover, .sym-item.focused { background: var(--color-surface-offset); color: var(--color-text); }
.sym-item.selected { color: var(--color-primary); font-weight: 600; }

.sym-name { font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.sym-item-right { display: flex; align-items: center; gap: 4px; }

.sym-fav {
  background: none; border: none; cursor: pointer;
  padding: 0 2px; line-height: 1;
  font-size: 13px; opacity: 0.4;
  transition: opacity 100ms, color 100ms;
}
.sym-fav:hover { opacity: 1; }
.fav-on  { color: var(--color-gold); opacity: 1 !important; }
.fav-off { color: var(--color-text-faint); }

.sym-empty {
  padding: 14px; text-align: center;
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

.sym-mtype {
  font-size: 9px; font-weight: 700; padding: 1px 4px;
  border-radius: 3px; letter-spacing: 0.05em;
  line-height: 1.4;
}
.sym-mtype.spot {
  background: var(--color-success-highlight);
  color: var(--color-success);
}
.sym-mtype.perp {
  background: var(--color-blue-highlight);
  color: var(--color-blue);
}
</style>
