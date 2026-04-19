// cores/derivatives-core/src/funding-tracker.ts
import type { NormalizedFunding } from '@crypto-platform/types'

type Sentiment = 'extreme_long' | 'long' | 'neutral' | 'short' | 'extreme_short'

export class FundingTracker {
  private store = new Map<string, NormalizedFunding>()

  update(f: NormalizedFunding): void {
    this.store.set(f.symbol, f)
  }

  get(symbol: string): NormalizedFunding | undefined {
    return this.store.get(symbol)
  }

  all(): NormalizedFunding[] {
    return [...this.store.values()]
  }

  sentiment(symbol: string): Sentiment {
    const f = this.store.get(symbol)
    if (!f) return 'neutral'
    const r = f.rate
    if (r >= 0.002)  return 'extreme_long'
    if (r >= 0.0005) return 'long'
    if (r <= -0.002) return 'extreme_short'
    if (r <= -0.0005)return 'short'
    return 'neutral'
  }
}
