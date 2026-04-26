<!-- apps/frontend/pages/index.vue -->
<template>
  <DashboardGrid />
</template>

<script setup lang="ts">
// FIX #4: вся логика подписки на system_status перенесена в useSystemStatus.
// index.vue больше не подписывается напрямую — нет дублирования handlers,
// нет расхождения между локальным ref и sysStore.
useSystemStatus()
</script>
