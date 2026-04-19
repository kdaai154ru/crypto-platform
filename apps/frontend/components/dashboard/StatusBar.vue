<!-- apps/frontend/components/dashboard/StatusBar.vue -->
<template>
  <div class="status-bar">
    <div class="status-item" @click="showModal = true">
      <span :class="['status-dot', systemDotStatus]" />
      <span>System</span>
    </div>

    <span style="color:var(--color-border);user-select:none">|</span>

    <div
      v-for="ex in exchanges" :key="ex.id"
      class="status-item"
      @mouseenter="hoveredEx = ex.id"
      @mouseleave="hoveredEx = null"
    >
      <span :class="['status-dot', exDotClass(ex.status)]" />
      <span>{{ ex.id }}</span>
      <div v-if="hoveredEx === ex.id" class="status-tooltip">
        <div style="font-weight:600;color:var(--color-text);margin-bottom:4px">{{ ex.id }}</div>
        <div>Status: <span :style="exTextStyle(ex.status)">{{ ex.status }}</span></div>
        <div>Latency: <span class="num">{{ ex.latencyMs }}ms</span></div>
        <div>Streams: <span class="num">{{ ex.streamsActive }}</span></div>
        <div v-if="ex.error" style="color:var(--color-error);margin-top:3px">{{ ex.error }}</div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
      <div class="modal-box" style="width:460px;max-height:80vh;overflow-y:auto">
        <div class="modal-header">
          <span class="modal-title">System Status</span>
          <button class="modal-close" @click="showModal = false">×</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Module</th><th>Status</th><th>Uptime</th><th>Restarts</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in modules" :key="m.id">
              <td>{{ m.id }}</td>
              <td><span :class="`text-${m.status}`">● {{ m.status }}</span></td>
              <td class="num">{{ formatUptime(m.uptimeMs) }}</td>
              <td class="num" style="color:var(--color-text-muted)">{{ m.restarts }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSystemStore } from '~/stores/system.store'
import type { ExchangeStatus } from '@crypto-platform/types'

const sys       = useSystemStore()
const showModal = ref(false)
const hoveredEx = ref<string | null>(null)

const modules   = computed(() => sys.payload?.modules  ?? [])
const exchanges = computed(() => sys.payload?.exchanges ?? [])

const systemDotStatus = computed(() => {
  if (!sys.payload) return 'unknown'
  if (modules.value.some(m => m.status === 'offline'))    return 'offline'
  if (modules.value.some(m => m.status === 'degraded' || m.status === 'restarting')) return 'degraded'
  return 'online'
})

function exDotClass(s: ExchangeStatus | string) {
  if (s === 'connected') return 'online'
  if (s === 'reconnecting' || s === 'degraded') return 'degraded'
  return 'offline'
}

function exTextStyle(s: string) {
  if (s === 'connected') return 'color:var(--color-success)'
  if (s === 'reconnecting' || s === 'degraded') return 'color:var(--color-warning)'
  return 'color:var(--color-error)'
}

function formatUptime(ms: number) {
  if (!ms) return '—'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}
</script>