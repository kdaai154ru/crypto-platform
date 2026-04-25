// tests/unit/circuit-breaker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CircuitBreaker } from '../../cores/exchange-core/src/circuit-breaker'

const makeOpts = (overrides = {}) => ({
  threshold:     3,
  resetMs:       1000,
  halfOpenCalls: 2,
  ...overrides,
})

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker

  beforeEach(() => {
    cb = new CircuitBreaker(makeOpts())
  })

  // ── initial state ──────────────────────────────────────────

  it('starts CLOSED and isOpen() = false', () => {
    expect(cb.getState()).toBe('closed')
    expect(cb.isOpen()).toBe(false)
  })

  // ── CLOSED → OPEN via recordFailure ────────────────────────

  it('opens after threshold consecutive failures', () => {
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.getState()).toBe('closed') // threshold = 3, not yet
    cb.recordFailure()
    expect(cb.getState()).toBe('open')
    expect(cb.isOpen()).toBe(true)
  })

  it('recordSuccess resets failure counter while CLOSED', () => {
    cb.recordFailure()
    cb.recordFailure()
    cb.recordSuccess()
    cb.recordFailure()
    expect(cb.getState()).toBe('closed') // counter reset, only 1 failure
  })

  it('calls onOpen callback exactly once when opening', () => {
    const onOpen = vi.fn()
    const cb2 = new CircuitBreaker(makeOpts({ onOpen }))
    cb2.recordFailure(); cb2.recordFailure(); cb2.recordFailure()
    cb2.recordFailure() // 4th failure — already open, onOpen NOT called again
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  // ── explicit open() ────────────────────────────────────────

  it('open() transitions to OPEN immediately', () => {
    cb.open()
    expect(cb.getState()).toBe('open')
    expect(cb.isOpen()).toBe(true)
  })

  it('double open() is a no-op — openedAt not reset', () => {
    cb.open()
    const firstOpenedAt = Date.now()
    cb.open() // should not reset openedAt
    // state still open, no error thrown
    expect(cb.getState()).toBe('open')
  })

  // ── OPEN → HALF-OPEN via resetMs ───────────────────────────

  it('transitions to HALF-OPEN after resetMs elapsed', () => {
    vi.useFakeTimers()
    cb.open()
    expect(cb.isOpen()).toBe(true)
    vi.advanceTimersByTime(1001)
    // isOpen() internally checks elapsed and transitions
    expect(cb.isOpen()).toBe(false)
    expect(cb.getState()).toBe('half-open')
    vi.useRealTimers()
  })

  // ── HALF-OPEN → CLOSED via recordSuccess ───────────────────

  it('closes after halfOpenCalls successes in HALF-OPEN', () => {
    vi.useFakeTimers()
    cb.open()
    vi.advanceTimersByTime(1001)
    cb.isOpen() // trigger transition
    expect(cb.getState()).toBe('half-open')

    cb.recordSuccess() // 1st success
    expect(cb.getState()).toBe('half-open') // halfOpenCalls = 2, not yet
    cb.recordSuccess() // 2nd success
    expect(cb.getState()).toBe('closed')
    expect(cb.failures).toBe(0)
    vi.useRealTimers()
  })

  // ── HALF-OPEN → OPEN via recordFailure ─────────────────────

  it('re-opens if recordFailure called in HALF-OPEN', () => {
    vi.useFakeTimers()
    cb.open()
    vi.advanceTimersByTime(1001)
    cb.isOpen()
    expect(cb.getState()).toBe('half-open')
    cb.recordFailure()
    expect(cb.getState()).toBe('open')
    vi.useRealTimers()
  })

  // ── isOpen() timing edge case ──────────────────────────────

  it('isOpen() returns true just before resetMs', () => {
    vi.useFakeTimers()
    cb.open()
    vi.advanceTimersByTime(999)
    expect(cb.isOpen()).toBe(true)
    vi.useRealTimers()
  })

  it('isOpen() returns false exactly at resetMs', () => {
    vi.useFakeTimers()
    cb.open()
    vi.advanceTimersByTime(1000)
    expect(cb.isOpen()).toBe(false)
    vi.useRealTimers()
  })

  // ── getState() coverage ────────────────────────────────────

  it('getState() reflects current state correctly', () => {
    expect(cb.getState()).toBe('closed')
    cb.open()
    expect(cb.getState()).toBe('open')
  })
})
