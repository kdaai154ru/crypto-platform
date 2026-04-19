// cores/exchange-core/src/circuit-breaker.ts
export type CBState = 'closed' | 'open' | 'half-open'

export interface CBOptions {
  threshold:     number   // failures before opening
  resetMs:       number   // time before trying half-open
  halfOpenCalls: number   // successes needed to close
  onOpen?:       () => void
}

export class CircuitBreaker {
  state:    CBState = 'closed'
  failures: number  = 0
  private successesInHalfOpen = 0
  private openedAt: number | null = null

  constructor(private readonly opts: CBOptions) {}

  isOpen(): boolean {
    if (this.state === 'open') {
      if (Date.now() - (this.openedAt ?? 0) >= this.opts.resetMs) {
        this.state = 'half-open'
        return false
      }
      return true
    }
    return false
  }

  recordFailure(): void {
    if (this.state === 'half-open') {
      this.state = 'open'
      this.openedAt = Date.now()
      return
    }
    this.failures++
    if (this.failures >= this.opts.threshold) {
      this.state = 'open'
      this.openedAt = Date.now()
      this.opts.onOpen?.()
    }
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successesInHalfOpen++
      if (this.successesInHalfOpen >= this.opts.halfOpenCalls) {
        this.state = 'closed'
        this.failures = 0
        this.successesInHalfOpen = 0
      }
      return
    }
    this.failures = 0
  }
}
