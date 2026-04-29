<!-- apps/frontend/components/SymbolPicker.vue -->
<!-- Универсальный пикер символов с поиском + категориями -->
<!-- Использование:
  <SymbolPicker v-model="mySymbols" :max="10" />
  emits: update:modelValue(string[])  — массив выбранных символов (без /USDT)
  prop max: максимальное кол-во выбранных (по умолчанию неограничено)
-->
<template>
  <div class="sp-root">
    <!-- Поиск -->
    <div class="sp-search-row">
      <input
        v-model="searchQuery"
        class="sp-input"
        placeholder="Search: BTC, ETH, DOGE…"
        type="search"
        autocomplete="off"
        spellcheck="false"
      />
      <span class="sp-count" v-if="modelValue.length">
        {{ modelValue.length }}{{ max ? '/'+max : '' }} selected
      </span>
    </div>

    <!-- Категории -->
    <div class="sp-cats">
      <button
        v-for="cat in categories"
        :key="cat"
        class="sp-cat-btn"
        :class="{ active: activeCategory === cat }"
        @click="activeCategory = cat"
      >
        {{ cat }}
      </button>
    </div>

    <!-- Список символов -->
    <div class="sp-list">
      <div v-if="!allSymbols.length" class="sp-empty">Loading…</div>
      <button
        v-for="sym in displayList"
        :key="sym"
        class="sp-sym-btn"
        :class="{ selected: isSelected(sym) }"
        @click="toggle(sym)"
      >
        {{ sym.replace('USDT', '') }}
      </button>
    </div>

    <!-- Текущий выбор -->
    <div v-if="modelValue.length" class="sp-selected-row">
      <span
        v-for="sym in modelValue"
        :key="sym"
        class="sp-tag"
        @click="toggle(sym)"
      >
        {{ sym.replace('USDT', '') }} ✕
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSymbolSearch, loadSymbols } from '~/composables/useSymbolSearch'

const props = defineProps<{
  modelValue: string[]  // массив символов как 'BTCUSDT'
  max?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [val: string[]] }>()

const {
  allSymbols,
  filtered,
  searchQuery,
  activeCategory,
  categories,
} = useSymbolSearch()

// Показываем максимум 60 в пикере для производительности
const displayList = computed(() => filtered.value.slice(0, 60))

function isSelected(sym: string) {
  return props.modelValue.includes(sym)
}

function toggle(sym: string) {
  const current = [...props.modelValue]
  const idx = current.indexOf(sym)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    if (props.max && current.length >= props.max) {
      // Заменяем последний при превышении max
      current.splice(current.length - 1, 1)
    }
    current.push(sym)
  }
  emit('update:modelValue', current)
}

onMounted(() => loadSymbols())
</script>

<style scoped>
.sp-root {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
}

.sp-search-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.sp-input {
  flex: 1;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  outline: none;
}
.sp-input:focus {
  border-color: var(--color-primary);
}

.sp-count {
  font-size: 10px;
  color: var(--color-text-faint);
  white-space: nowrap;
}

.sp-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.sp-cat-btn {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-interactive);
}
.sp-cat-btn:hover  { border-color: var(--color-primary); color: var(--color-primary); }
.sp-cat-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.sp-list {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  max-height: 120px;
  overflow-y: auto;
}

.sp-empty {
  font-size: 11px;
  color: var(--color-text-faint);
}

.sp-sym-btn {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-interactive);
}
.sp-sym-btn:hover   { border-color: var(--color-primary); color: var(--color-primary); }
.sp-sym-btn.selected {
  background: color-mix(in oklch, var(--color-primary) 15%, var(--color-surface));
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.sp-selected-row {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding-top: var(--space-1);
  border-top: 1px solid var(--color-divider);
}

.sp-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: color-mix(in oklch, var(--color-primary) 12%, var(--color-surface));
  color: var(--color-primary);
  border: 1px solid color-mix(in oklch, var(--color-primary) 30%, transparent);
  cursor: pointer;
  transition: all var(--transition-interactive);
}
.sp-tag:hover {
  background: color-mix(in oklch, var(--color-error) 12%, var(--color-surface));
  color: var(--color-error);
  border-color: var(--color-error);
}
</style>
