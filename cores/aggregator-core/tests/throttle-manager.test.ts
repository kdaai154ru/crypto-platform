// cores/aggregator-core/tests/throttle-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThrottleManager } from '../src/throttle-manager.js'

describe('ThrottleManager', () => {
  it('calls fn immediately on first call', () => {
    const fn = vi.fn()
    const tm = new ThrottleManager(100)
    tm.schedule('key1', fn)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('throttles subsequent calls within window', async () => {
    const fn = vi.fn()
    const tm = new ThrottleManager(100)
    tm.schedule('key1', fn)
    tm.schedule('key1', fn)
    tm.schedule('key1', fn)
    expect(fn).toHaveBeenCalledOnce()
    await new Promise(r => setTimeout(r, 120))
    expect(fn.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('handles multiple keys independently', () => {
    const fn1 = vi.fn(), fn2 = vi.fn()
    const tm = new ThrottleManager(100)
    tm.schedule('k1', fn1)
    tm.schedule('k2', fn2)
    tm.schedule('k1', fn1)
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
  })
})
