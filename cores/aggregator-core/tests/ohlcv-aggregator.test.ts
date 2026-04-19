// cores/aggregator-core/tests/ohlcv-aggregator.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { OHLCVAggregator } from '../src/ohlcv-aggregator.js'
import type { NormalizedTrade } from '@crypto-platform/types'

function makeTrade(price: number, qty: number, side: 'buy'|'sell', ts: number): NormalizedTrade {
  return { symbol:'BTC/USDT', exchange:'binance', price, qty, side, ts,
           usdValue: price * qty, isLarge: false, sizeLabel:'M' }
}

describe('OHLCVAggregator', () => {
  let agg: OHLCVAggregator

  beforeEach(() => {
    agg = new OHLCVAggregator({ tf:'1m', symbol:'BTC/USDT', exchange:'binance' })
  })

  it('creates first candle from first trade', () => {
    const ts = 1_700_000_000_000
    const candle = agg.update(makeTrade(50000, 1, 'buy', ts))
    expect(candle).not.toBeNull()
    expect(candle!.open).toBe(50000)
    expect(candle!.high).toBe(50000)
    expect(candle!.low).toBe(50000)
    expect(candle!.close).toBe(50000)
    expect(candle!.volume).toBe(1)
    expect(candle!.buyVolume).toBe(1)
    expect(candle!.sellVolume).toBe(0)
  })

  it('updates high/low correctly', () => {
    const base = 1_700_000_000_000
    agg.update(makeTrade(50000, 1, 'buy', base))
    agg.update(makeTrade(51000, 0.5, 'buy', base + 1000))
    const candle = agg.update(makeTrade(49000, 0.3, 'sell', base + 2000))
    expect(candle!.high).toBe(51000)
    expect(candle!.low).toBe(49000)
    expect(candle!.close).toBe(49000)
    expect(candle!.volume).toBeCloseTo(1.8)
    expect(candle!.sellVolume).toBeCloseTo(0.3)
  })

  it('closes candle on new minute boundary and emits closed', () => {
    const base = 1_700_000_060_000  // minute boundary
    agg.update(makeTrade(50000, 1, 'buy', base))
    let closed: unknown = null
    agg.onClose = c => { closed = c }
    // trade in next minute
    agg.update(makeTrade(51000, 0.5, 'buy', base + 60_000))
    expect(closed).not.toBeNull()
    expect((closed as {open:number}).open).toBe(50000)
  })

  it('correctly segments buy vs sell volume', () => {
    const base = 1_700_000_000_000
    agg.update(makeTrade(50000, 2, 'buy', base))
    agg.update(makeTrade(50000, 1, 'sell', base + 1000))
    const c = agg.update(makeTrade(50000, 0.5, 'buy', base + 2000))
    expect(c!.buyVolume).toBeCloseTo(2.5)
    expect(c!.sellVolume).toBeCloseTo(1)
  })
})
