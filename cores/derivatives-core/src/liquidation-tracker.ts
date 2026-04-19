// cores/derivatives-core/src/liquidation-tracker.ts
import type { NormalizedLiquidation } from '@crypto-platform/types'

export interface LiqWindow {
  longUsd:  number
  shortUsd: number
  total:    number
  dominant: 'long' | 'short' | 'neutral'
}

export class LiquidationTracker {
  private events: NormalizedLiquidation[] = []
  private readonly maxEvents = 500

  add(liq: NormalizedLiquidation): void {
    this.events.push(liq)
    if (this.events.length > this.maxEvents) this.events.shift()
  }

  recent(limitMs = 60_000): NormalizedLiquidation[] {
    const cutoff = Date.now() - limitMs
    return this.events.filter(e => e.ts >= cutoff)
  }

  window(symbol?: string, limitMs = 60_000): LiqWindow {
    let evts = this.recent(limitMs)
    if (symbol) evts = evts.filter(e => e.symbol === symbol)
    const longUsd  = evts.filter(e => e.side === 'long').reduce((s, e) => s + e.usdValue, 0)
    const shortUsd = evts.filter(e => e.side === 'short').reduce((s, e) => s + e.usdValue, 0)
    const dominant = Math.abs(longUsd - shortUsd) < 1
      ? 'neutral' : longUsd > shortUsd ? 'long' : 'short'
    return { longUsd, shortUsd, total: longUsd + shortUsd, dominant }
  }
}
