// cores/trades-core/src/delta-calculator.ts
import type { NormalizedTrade } from '@crypto-platform/types'

export interface TradeDelta {
  symbol:       string
  ts:           number
  buyVolumeUsd: number
  sellVolumeUsd:number
  delta:        number
  dominance:    'buy' | 'sell' | 'neutral'
  largeBuys:    number
  largeSells:   number
  totalTrades:  number
}

export class DeltaCalculator {
  private buyUsd  = 0
  private sellUsd = 0
  private largeBuys  = 0
  private largeSells = 0
  private total  = 0

  add(trade: NormalizedTrade): void {
    this.total++
    if (trade.side === 'buy') {
      this.buyUsd += trade.usdValue
      if (trade.isLarge) this.largeBuys++
    } else {
      this.sellUsd += trade.usdValue
      if (trade.isLarge) this.largeSells++
    }
  }

  flush(symbol: string): TradeDelta {
    const delta = this.buyUsd - this.sellUsd
    const dominance = Math.abs(delta) < 1
      ? 'neutral'
      : delta > 0 ? 'buy' : 'sell'

    const result: TradeDelta = {
      symbol, ts: Date.now(),
      buyVolumeUsd:  this.buyUsd,
      sellVolumeUsd: this.sellUsd,
      delta, dominance,
      largeBuys:  this.largeBuys,
      largeSells: this.largeSells,
      totalTrades: this.total,
    }
    this.buyUsd = 0; this.sellUsd = 0
    this.largeBuys = 0; this.largeSells = 0
    this.total = 0
    return result
  }
}
