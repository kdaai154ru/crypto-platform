// tests/module-registry.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ModuleRegistry } from '../src/module-registry.js'

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() } as any

describe('ModuleRegistry', () => {
  let registry: ModuleRegistry

  beforeEach(() => {
    registry = new ModuleRegistry(mockLog)
  })

  it('all modules start as offline', () => {
    const all = registry.all()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(m.status).toBe('offline')
    }
  })

  it('heartbeat sets module online', () => {
    registry.heartbeat('exchange-core')
    const m = registry.get('exchange-core')
    expect(m?.status).toBe('online')
  })

  it('heartbeat with error sets module degraded', () => {
    registry.heartbeat('exchange-core', 'connection timeout')
    const m = registry.get('exchange-core')
    expect(m?.status).toBe('degraded')
    expect(m?.error).toBe('connection timeout')
  })

  it('uptimeMs increases after startedAt is set', () => {
    registry.heartbeat('exchange-core')
    const before = registry.get('exchange-core')!.uptimeMs
    registry.tick()
    const after = registry.get('exchange-core')!.uptimeMs
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('restarts counter increments on recovery', () => {
    // Сначала online
    registry.heartbeat('exchange-core')
    // Симулируем offline через tick с просроченным heartbeat
    const m = registry.get('exchange-core')!
    m.lastHeartbeat = Date.now() - 70_000  // > OFFLINE_TIMEOUT
    registry.tick()
    expect(m.status).toBe('offline')
    // Снова heartbeat - должен увеличить restarts
    registry.heartbeat('exchange-core')
    expect(m.restarts).toBe(1)
  })

  it('reset clears state', () => {
    registry.heartbeat('exchange-core')
    registry.reset('exchange-core')
    const m = registry.get('exchange-core')
    expect(m?.status).toBe('offline')
    expect(m?.uptimeMs).toBe(0)
  })

  it('getOffline returns correct ids', () => {
    registry.heartbeat('exchange-core')
    const offline = registry.getOffline()
    expect(offline).not.toContain('exchange-core')
    expect(offline.length).toBe(registry.all().length - 1)
  })
})
