// apps/orchestrator/tests/module-registry.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ModuleRegistry } from '../src/module-registry.js'
import { createLogger } from '@crypto-platform/logger'

const log = createLogger('test')

describe('ModuleRegistry', () => {
  let reg: ModuleRegistry

  beforeEach(() => { reg = new ModuleRegistry(log) })

  it('initializes all modules as offline', () => {
    const all = reg.all()
    expect(all.length).toBeGreaterThan(0)
    expect(all.every(m => m.status === 'offline')).toBe(true)
  })

  it('marks module as online on heartbeat', () => {
    reg.heartbeat('exchange-core')
    expect(reg.get('exchange-core')?.status).toBe('online')
  })

  it('marks module as degraded when heartbeat includes error', () => {
    reg.heartbeat('exchange-core', 'rate limited')
    expect(reg.get('exchange-core')?.status).toBe('degraded')
    expect(reg.get('exchange-core')?.error).toBe('rate limited')
  })

  it('increments restart count when coming back from offline', () => {
    reg.heartbeat('trades-core')  // online
    // simulate tick degrading it to offline
    const s = reg.get('trades-core')!
    s.status = 'offline'
    s.lastHeartbeat = Date.now() - 70_000
    reg.tick()
    reg.heartbeat('trades-core')  // comes back
    expect(reg.get('trades-core')?.restarts).toBe(1)
  })

  it('transitions online → degraded → restarting → offline via tick', () => {
    reg.heartbeat('normalizer-core')
    const s = reg.get('normalizer-core')!

    // simulate stale heartbeat > 10s → degraded
    s.lastHeartbeat = Date.now() - 11_000
    reg.tick()
    expect(s.status).toBe('degraded')

    // > 30s → restarting
    s.lastHeartbeat = Date.now() - 31_000
    reg.tick()
    expect(s.status).toBe('restarting')

    // > 60s → offline
    s.lastHeartbeat = Date.now() - 61_000
    reg.tick()
    expect(s.status).toBe('offline')
  })

  it('ignores heartbeat for unknown module id', () => {
    expect(() => reg.heartbeat('unknown-module')).not.toThrow()
  })
})
