// cores/exchange-core/src/rate-limit-tracker.ts
export interface RLOptions {
  requestsPerSecond: number
  windowMs:          number
}

export class RateLimitTracker {
  private calls: number[] = []

  constructor(private readonly opts: RLOptions) {}

  canProceed(): boolean {
    const now = Date.now()
    this.calls = this.calls.filter(t => now - t < this.opts.windowMs)
    if (this.calls.length >= this.opts.requestsPerSecond) return false
    this.calls.push(now)
    return true
  }

  waitMs(): number {
    if (this.calls.length === 0) return 0
    const oldest = this.calls[0]!
    return Math.max(0, this.opts.windowMs - (Date.now() - oldest))
  }
}
