// cores/derivatives-core/src/trackers.ts
import type { NormalizedOI, NormalizedFunding, NormalizedLiquidation } from '@crypto-platform/types'

export class OITracker {
  private store = new Map<string, NormalizedOI>()
  update(d: NormalizedOI): void { this.store.set(`${d.symbol}:${d.exchange}`, d) }
  get(symbol: string, exchange: string): NormalizedOI|undefined { return this.store.get(`${symbol}:${exchange}`) }
  all(): NormalizedOI[] { return [...this.store.values()] }
}
export class FundingTracker {
  private store = new Map<string, NormalizedFunding>()
  update(d: NormalizedFunding): void { this.store.set(`${d.symbol}:${d.exchange}`, d) }
  get(symbol: string, exchange: string): NormalizedFunding|undefined { return this.store.get(`${symbol}:${exchange}`) }
  extremes(threshold=0.001): NormalizedFunding[] { return [...this.store.values()].filter(f=>Math.abs(f.rate)>=threshold) }
}
export class LiquidationTracker {
  private recent: NormalizedLiquidation[] = []
  add(d: NormalizedLiquidation): void {
    this.recent.push(d)
    if (this.recent.length > 1000) this.recent.shift()
  }
  getRecent(limit=50): NormalizedLiquidation[] { return this.recent.slice(-limit) }
}
