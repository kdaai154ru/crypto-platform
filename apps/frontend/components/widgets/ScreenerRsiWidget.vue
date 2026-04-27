<!-- apps/frontend/components/widgets/ScreenerRsiWidget.vue -->
<template>
  <div class="h-full overflow-auto px-2 py-1">
    <table class="w-full text-xs screener-table">
      <thead>
        <tr class="text-muted border-b border-border">
          <th
            class="text-left pb-1 sortable"
            :class="sortKey === 'symbol' ? 'sorted' : ''"
            @click="setSort('symbol')"
          >
            Symbol
            <span class="sort-arrow">{{ sortKey === 'symbol' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅' }}</span>
          </th>
          <th
            v-for="tf in tfs" :key="tf"
            class="text-center pb-1 sortable"
            :class="sortKey === tf ? 'sorted' : ''"
            @click="setSort(tf)"
          >
            {{ tf }}
            <span class="sort-arrow">{{ sortKey === tf ? (sortDir === 'asc' ? '▲' : '▼') : '⇅' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sortedRows" :key="row.symbol" class="border-t border-border/50 hover:bg-surface-offset">
          <td class="py-1 font-medium">{{ row.symbol }}</td>
          <td v-for="tf in tfs" :key="tf" class="text-center">
            <span v-if="row[tf] != null" :class="rsiColor(row[tf] as number)" class="px-1.5 py-0.5 rounded text-[10px]">
              {{ (row[tf] as number).toFixed(1) }}
            </span>
            <span v-else class="text-faint">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ScreenerRow } from '@crypto-platform/types'
import { useWidgetSubscription } from '~/composables/useWidgetSubscription'

const tfs = ['5m', '15m', '1h', '4h', '1d']
const rows = ref<Map<string, Record<string, number>>>(new Map())

// Сортировка
const sortKey = ref<string>('symbol')
const sortDir = ref<'asc' | 'desc'>('asc')

function setSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'symbol' ? 'asc' : 'desc'
  }
}

const tableRows = computed(() =>
  [...rows.value.entries()].map(([symbol, r]) => ({ symbol, ...r }))
)

const sortedRows = computed(() => {
  const arr = [...tableRows.value]
  const key = sortKey.value
  const dir  = sortDir.value === 'asc' ? 1 : -1
  arr.sort((a, b) => {
    if (key === 'symbol') {
      return a.symbol.localeCompare(b.symbol) * dir
    }
    const av = (a as Record<string, unknown>)[key] as number | undefined
    const bv = (b as Record<string, unknown>)[key] as number | undefined
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return (av - bv) * dir
  })
  return arr.slice(0, 50)
})

const rsiColor = (v: number) =>
  v >= 70 ? 'bg-red-500/20 text-red-400' :
  v <= 30 ? 'bg-green-500/20 text-green-400' :
  'text-muted'

const emptySymbol = computed(() => '')

useWidgetSubscription('screener-rsi', ['screener_update'], emptySymbol,
  (_ch, data) => {
    const arr = data as ScreenerRow[]
    for (const r of arr) {
      if (r.screener !== 'rsi') continue
      const cur = rows.value.get(r.symbol) ?? {}
      cur[r.tf] = r.value
      rows.value.set(r.symbol, cur)
    }
  }
)
</script>

<style scoped>
.screener-table th.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.screener-table th.sortable:hover { color: var(--color-text); }
.screener-table th.sorted { color: var(--color-primary); }
.sort-arrow { font-size: 9px; margin-left: 2px; opacity: 0.6; }
.text-faint { color: var(--color-text-faint); }
</style>
