<!-- apps/frontend/components/dashboard/Toolbar.vue -->
<template>
  <div class="toolbar">
    <!-- Logo -->
    <div class="toolbar-logo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
           stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <span>CryptoAnalytics</span>
    </div>

    <!-- Global Symbol Selector -->
    <div class="toolbar-symbol">
      <DashboardSymbolSelector />
      <div class="tf-tabs">
        <button
          v-for="t in TFS" :key="t"
          :class="['tf-btn', activeTf === t && 'active']"
          @click="symbolStore.setTf(t)"
        >{{ t }}</button>
      </div>
    </div>

    <!-- Right controls -->
    <div class="toolbar-right">
      <span :class="['ws-dot', connected ? 'connected' : 'disconnected']"
            :title="connected ? 'WS connected' : 'WS disconnected'" />

      <div class="theme-selector">
        <button
          v-for="t in THEMES" :key="t.id"
          :class="['theme-btn', `theme-${t.id}`, currentTheme === t.id && 'active']"
          :title="t.label"
          @click="setTheme(t.id)"
        />
      </div>

      <button class="btn-sm" @click="toggleEdit">
        {{ editMode ? '✓ Done' : '⊞ Edit' }}
      </button>
      <button class="btn-sm btn-primary" @click="pickerOpen = true">
        + Widget
      </button>
    </div>

    <!-- WidgetPicker внутри root-div → нет фрагмента → нет Vue warn -->
    <DashboardWidgetPicker :open="pickerOpen" @close="pickerOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'
import { storeToRefs } from 'pinia'
import type { Ref } from 'vue'
import { useSymbolStore } from '~/stores/symbol.store'
import { useWsClient } from '~/composables/useWsClient'

const editMode    = inject<Ref<boolean>>('editMode')!
const pickerOpen  = ref(false)
const symbolStore = useSymbolStore()
const { activeTf } = storeToRefs(symbolStore)
const { connected } = useWsClient()

const TFS = ['1m', '5m', '15m', '1h', '4h', '1d']

const THEMES = [
  { id: 'dark',  label: 'Dark' },
  { id: 'dim',   label: 'Dim' },
  { id: 'gray',  label: 'Gray' },
  { id: 'light', label: 'Light' },
]

const currentTheme = ref<string>(
  typeof document !== 'undefined'
    ? (document.documentElement.getAttribute('data-theme') ?? 'dark')
    : 'dark'
)

function setTheme(t: string) {
  currentTheme.value = t
  if (typeof document !== 'undefined')
    document.documentElement.setAttribute('data-theme', t)
}

function toggleEdit() { editMode.value = !editMode.value }
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-4);
  height: 44px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  overflow: visible;
}

.toolbar-logo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}

.toolbar-symbol {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
}

.tf-tabs {
  display: flex;
  gap: 2px;
}

.tf-btn {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 120ms;
}
.tf-btn:hover { color: var(--color-text); background: var(--color-surface-offset); }
.tf-btn.active { color: var(--color-primary); border-color: var(--color-primary); background: var(--color-primary-highlight); }

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-left: auto;
}

.ws-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
}
.ws-dot.connected    { background: var(--color-success); box-shadow: 0 0 6px var(--color-success); }
.ws-dot.disconnected { background: var(--color-text-faint); }

.theme-selector { display: flex; gap: 4px; }
.theme-btn {
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 120ms;
}
.theme-btn.active { border-color: var(--color-text); }
.theme-btn.theme-dark  { background: #171614; }
.theme-btn.theme-dim   { background: #1e1e2e; }
.theme-btn.theme-gray  { background: #313244; }
.theme-btn.theme-light { background: #f7f6f2; border: 2px solid var(--color-border); }

.btn-sm {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  transition: all 120ms;
  white-space: nowrap;
}
.btn-sm:hover { color: var(--color-text); border-color: var(--color-text-muted); }
.btn-sm.btn-primary {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.btn-sm.btn-primary:hover { background: var(--color-primary-highlight); }
</style>
