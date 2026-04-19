<!-- apps/frontend/components/widgets/StatusPanelWidget.vue -->
<template>
  <div class="h-full overflow-auto p-3 text-xs">
    <table class="w-full">
      <thead><tr class="text-muted"><th class="text-left pb-2">Module</th><th class="pb-2">Status</th><th class="pb-2">Uptime</th></tr></thead>
      <tbody>
        <tr v-for="m in modules" :key="m.id" class="border-t border-border/50">
          <td class="py-1">{{ m.id }}</td>
          <td class="text-center"><span :class="color(m.status)">● {{ m.status }}</span></td>
          <td class="text-center text-muted">{{ m.uptimeMs ? Math.floor(m.uptimeMs/60000)+ 'm' : '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup lang="ts">
import { useSystemStore } from '~/stores/system.store'
import type { ModuleStatus } from '@crypto-platform/types'
const sys = useSystemStore()
const modules = computed(()=>sys.payload?.modules??[])
const color = (s:ModuleStatus)=>
  s==='online'?'text-green-400':s==='degraded'||s==='restarting'?'text-yellow-400':'text-red-400'
</script>
