// apps/frontend/composables/useLayoutPersistence.ts
import type { DashboardLayout } from '@crypto-platform/types'

const KEY = 'crypto-platform:layouts-v2'

export function useLayoutPersistence() {
  function load(): DashboardLayout[] {
    if (import.meta.server) return []
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as DashboardLayout[]) : []
    } catch { return [] }
  }

  function save(layouts: DashboardLayout[]): void {
    if (import.meta.server) return
    try { localStorage.setItem(KEY, JSON.stringify(layouts)) } catch { /* quota */ }
  }

  return { load, save }
}