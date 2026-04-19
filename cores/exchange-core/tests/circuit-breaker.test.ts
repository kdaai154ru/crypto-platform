// cores/exchange-core/tests/circuit-breaker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CircuitBreaker } from '../src/circuit-breaker.js'

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker

  beforeEach(() => {
    cb = new CircuitBreaker({ threshold: 3, resetMs: 500, halfOpenCalls: 1 })
  })

  it('starts closed', () => {
    expect(cb.state).toBe('closed')
    expect(cb.isOpen()).toBe(false)
  })

  it('opens after threshold failures', () => {
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.state).toBe('closed')
    cb.recordFailure()
    expect(cb.state).toBe('open')
    expect(cb.isOpen()).toBe(true)
  })

  it('transitions to half-open after resetMs', async () => {
    cb.recordFailure(); cb.recordFailure(); cb.recordFailure()
    expect(cb.state).toBe('open')
    await new Promise(r => setTimeout(r, 550))
    expect(cb.state).toBe('half-open')
    expect(cb.isOpen()).toBe(false)
  })

  it('closes on success from half-open', async () => {
    cb.recordFailure(); cb.recordFailure(); cb.recordFailure()
    await new Promise(r => setTimeout(r, 550))
    cb.recordSuccess()
    expect(cb.state).toBe('closed')
    expect(cb.failures).toBe(0)
  })

  it('re-opens on failure from half-open', async () => {
    cb.recordFailure(); cb.recordFailure(); cb.recordFailure()
    await new Promise(r => setTimeout(r, 550))
    cb.recordFailure()
    expect(cb.state).toBe('open')
  })

  it('resets failure count on success', () => {
    cb.recordFailure(); cb.recordFailure()
    cb.recordSuccess()
    expect(cb.failures).toBe(0)
    expect(cb.state).toBe('closed')
  })

  it('calls onOpen callback when opening', () => {
    const onOpen = vi.fn()
    cb = new CircuitBreaker({ threshold: 2, resetMs: 500, halfOpenCalls: 1, onOpen })
    cb.recordFailure(); cb.recordFailure()
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
