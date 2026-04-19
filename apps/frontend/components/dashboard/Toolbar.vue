<!-- apps/frontend/components/dashboard/Toolbar.vue -->
<template>
  <div class="toolbar">
    <div class="toolbar-logo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
           stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <span>CryptoAnalytics</span>
    </div>

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
  </div>

  <DashboardWidgetPicker :open="pickerOpen" @close="pickerOpen = false" @add="onAddWidget" />
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'
import type { Ref } from 'vue'
import { useLayoutStore } from '~/stores/layout.store'
import { useWsClient } from '~/composables/useWsClient'
import type { WidgetLayout } from '@crypto-platform/types'

const editMode    = inject<Ref<boolean>>('editMode')!
const pickerOpen  = ref(false)
const layoutStore = useLayoutStore()
const { connected } = useWsClient()

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

function onAddWidget(w: WidgetLayout) { layoutStore.addWidget(w) }
</script>