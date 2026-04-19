// cores/trades-core/tests/delta-calculator.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { DeltaCalculator } from '../src/delta-calculator.js'
import type { NormalizedTrade } from '@crypto-platform/types'

function trade(side: 'buy'|'sell', usdValue: number): NormalizedTrade {
  return { symbol:'BTC/USDT', exchange:'binance', price:50000, qty:usdValue/50000,
           side, ts:Date.now(), usdValue, isLarge: usdValue >= 100_000, sizeLabel:'M' }
}

describe('DeltaCalculator', () => {
  let dc: DeltaCalculator

  beforeEach(() => { dc = new DeltaCalculator() })

  it('computes positive delta when buys > sells', () => {
    dc.add(trade('buy', 1_000_000))
    dc.add(trade('sell', 400_000))
    const d = dc.flush('BTC/USDT')
    expect(d.buyVolumeUsd).toBe(1_000_000)
    expect(d.sellVolumeUsd).toBe(400_000)
    expect(d.delta).toBe(600_000)
    expect(d.dominance).toBe('buy')
  })

  it('computes negative delta when sells > buys', () => {
    dc.add(trade('sell', 800_000))
    dc.add(trade('buy', 200_000))
    const d = dc.flush('BTC/USDT')
    expect(d.delta).toBe(-600_000)
    expect(d.dominance).toBe('sell')
  })

  it('resets after flush', () => {
    dc.add(trade('buy', 500_000))
    dc.flush('BTC/USDT')
    const d2 = dc.flush('BTC/USDT')
    expect(d2.buyVolumeUsd).toBe(0)
    expect(d2.sellVolumeUsd).toBe(0)
    expect(d2.delta).toBe(0)
  })

  it('counts large trades separately', () => {
    dc.add(trade('buy', 50_000))    // not large
    dc.add(trade('buy', 150_000))   // large
    dc.add(trade('sell', 200_000))  // large
    const d = dc.flush('BTC/USDT')
    expect(d.largeBuys).toBe(1)
    expect(d.largeSells).toBe(1)
    expect(d.totalTrades).toBe(3)
  })

  it('returns neutral dominance when equal', () => {
    dc.add(trade('buy', 500_000))
    dc.add(trade('sell', 500_000))
    const d = dc.flush('BTC/USDT')
    expect(d.dominance).toBe('neutral')
  })
})
