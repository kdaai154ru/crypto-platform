<!-- apps/frontend/components/SymbolPicker.vue -->
<!-- Универсальный пикер символов с поиском, топ-N и категориями -->
<template>
  <div class="sp-root">
    <!-- Поиск + топ-N -->
    <div class="sp-top">
      <input
        v-model="searchQuery"
        class="sp-search"
        placeholder="Search symbol…"
        @input="onSearch"
        @keydown.enter.prevent="onEnterPick"
      />
      <select v-if="showTopN" v-model="topNLocal" class="sp-topn" @change="onTopNChange">
        <option value="0">Custom</option>
        <option v-for="n in TOP_N_OPTIONS" :key="n" :value="n">Top {{ n }}</option>
      </select>
    </div>
    <!-- Категории -->
    <div class="sp-cats">
      <button
        v-for="cat in categories" :key="cat"
        :class="['sp-cat', activeCategory===cat ? 'active' : '']"
        @click="activeCategory = cat as Category"
      >{{ cat }}</button>
    </div>
    <!-- Список -->
    <div class="sp-list">
      <div
        v-for="sym in visibleList" :key="sym"
        :class="['sp-item', isSelected(sym) ? 'selected' : '']"
        @click="toggleSym(sym)"
      >
        <span class="sp-name">{{ sym.replace('USDT', '') }}</span>
        <span v-if="isSelected(sym)" class="sp-check">✓</span>
      </div>
      <div v-if="visibleList.length === 0" class="sp-empty">No results</div>
    </div>
    <!-- Выбранные тэги -->
    <div v-if="modelValue.length" class="sp-selected">
      <span
        v-for="sym in modelValue" :key="sym"
        class="sp-tag"
        @click="toggleSym(sym)"
      >{{ sym.replace('USDT','') }} ✕</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useSymbolSearch, loadSymbols, getTopN, type Category } from '~/composables/useSymbolSearch'

const props = defineProps<{
  modelValue: string[]
  max?: number
  showTopN?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()

const TOP_N_OPTIONS = [100,200,300,400,500,600,700,800,900,1000,1500,2000,3000,4000]

const { filtered, searchQuery, activeCategory, categories } = useSymbolSearch()
const topNLocal = ref(0)
const topNSymbols = ref<string[]>([])

const visibleList = computed(() => {
  if (topNLocal.value > 0 && topNSymbols.value.length > 0) return topNSymbols.value
  return filtered.value.slice(0, 200)
})

function isSelected(sym: string) {
  return props.modelValue.includes(sym)
}
function toggleSym(sym: string) {
  const arr = [...props.modelValue]
  const idx = arr.indexOf(sym)
  if (idx >= 0) {
    arr.splice(idx, 1)
  } else {
    if (props.max && arr.length >= props.max) arr.shift()
    arr.push(sym)
  }
  emit('update:modelValue', arr)
}
function onEnterPick() {
  const q = searchQuery.value.trim().toUpperCase()
  if (!q) return
  const match = filtered.value.find(s => s === q + 'USDT' || s === q)
  if (match) toggleSym(match)
}
async function onTopNChange() {
  if (topNLocal.value === 0) { topNSymbols.value = []; return }
  topNSymbols.value = await getTopN(topNLocal.value)
  emit('update:modelValue', [...topNSymbols.value])
}
function onSearch() {
  topNLocal.value = 0
  topNSymbols.value = []
}

onMounted(() => loadSymbols())
</script>

<style scoped>
.sp-root { display: flex; flex-direction: column; gap: 4px; padding: 6px; }
.sp-top  { display: flex; gap: 4px; }
.sp-search {
  flex: 1; font-size: 11px; padding: 3px 6px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text);
  outline: none;
}
.sp-search:focus { border-color: var(--color-primary); }
.sp-topn {
  font-size: 10px; padding: 2px 4px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
}
.sp-cats {
  display: flex; flex-wrap: wrap; gap: 3px;
}
.sp-cat {
  font-size: 9px; padding: 1px 5px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-faint);
  cursor: pointer; transition: all var(--transition-interactive);
}
.sp-cat:hover  { border-color: var(--color-primary); color: var(--color-text-muted); }
.sp-cat.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.sp-list {
  max-height: 160px; overflow-y: auto;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  background: var(--color-surface);
}
.sp-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px 8px; font-size: 11px; color: var(--color-text-muted);
  cursor: pointer; transition: background var(--transition-interactive);
}
.sp-item:hover    { background: var(--color-surface-offset); }
.sp-item.selected { background: color-mix(in oklch, var(--color-primary) 12%, transparent); color: var(--color-primary); }
.sp-name  { font-weight: 500; }
.sp-check { font-size: 10px; color: var(--color-primary); }
.sp-empty { padding: 8px; font-size: 10px; color: var(--color-text-faint); text-align: center; }
.sp-selected {
  display: flex; flex-wrap: wrap; gap: 3px;
  padding-top: 4px; border-top: 1px solid var(--color-divider);
}
.sp-tag {
  font-size: 9px; padding: 1px 5px;
  border-radius: var(--radius-full);
  background: color-mix(in oklch, var(--color-primary) 15%, transparent);
  color: var(--color-primary); cursor: pointer;
  transition: background var(--transition-interactive);
}
.sp-tag:hover { background: color-mix(in oklch, var(--color-error) 20%, transparent); color: var(--color-error); }
</style>
