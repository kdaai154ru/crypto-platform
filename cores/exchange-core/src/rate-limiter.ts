// cores/exchange-core/src/rate-limiter.ts
export class RateLimiter {
  private tokens: number
  private lastRefill: number
  constructor(private readonly rps: number) {
    this.tokens = rps; this.lastRefill = Date.now()
  }
  async acquire(): Promise<void> {
    this.refill()
    if (this.tokens >= 1) { this.tokens--; return }
    await new Promise<void>(r => setTimeout(r, 1000 / this.rps))
    // FIX: refill again after sleep so elapsed time is credited,
    // then clamp to 0 to prevent negative token counts.
    this.refill()
    this.tokens = Math.max(0, this.tokens - 1)
  }
  private refill() {
    const now = Date.now(), elapsed = now - this.lastRefill
    this.tokens = Math.min(this.rps, this.tokens + elapsed * this.rps / 1000)
    this.lastRefill = now
  }
}
