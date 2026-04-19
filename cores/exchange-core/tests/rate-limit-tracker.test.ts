// cores/exchange-core/tests/rate-limit-tracker.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RateLimitTracker } from '../src/rate-limit-tracker.js'

describe('RateLimitTracker', () => {
  let tracker: RateLimitTracker

  beforeEach(() => {
    tracker = new RateLimitTracker({ requestsPerSecond: 5, windowMs: 1000 })
  })

  it('allows requests within limit', () => {
    for (let i = 0; i < 5; i++) expect(tracker.canProceed()).toBe(true)
  })

  it('blocks requests exceeding limit', () => {
    for (let i = 0; i < 5; i++) tracker.canProceed()
    expect(tracker.canProceed()).toBe(false)
  })

  it('resets after window expires', async () => {
    for (let i = 0; i < 5; i++) tracker.canProceed()
    expect(tracker.canProceed()).toBe(false)
    await new Promise(r => setTimeout(r, 1050))
    expect(tracker.canProceed()).toBe(true)
  })

  it('returns correct waitMs when blocked', () => {
    for (let i = 0; i < 5; i++) tracker.canProceed()
    expect(tracker.waitMs()).toBeGreaterThan(0)
    expect(tracker.waitMs()).toBeLessThanOrEqual(1000)
  })
})
