// cores/derivatives-core/tests/funding-tracker.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { FundingTracker } from '../src/funding-tracker.js'
import type { NormalizedFunding } from '@crypto-platform/types'

function makeFunding(rate: number, symbol = 'BTC/USDT'): NormalizedFunding {
  return { symbol, exchange: 'binance', rate, nextFundingTs: Date.now() + 28_800_000, ts: Date.now() }
}

describe('FundingTracker', () => {
  let tracker: FundingTracker

  beforeEach(() => { tracker = new FundingTracker() })

  it('stores latest funding for a symbol', () => {
    tracker.update(makeFunding(0.0001))
    expect(tracker.get('BTC/USDT')?.rate).toBe(0.0001)
  })

  it('overwrites with newer data', () => {
    tracker.update(makeFunding(0.0001))
    tracker.update(makeFunding(0.0003))
    expect(tracker.get('BTC/USDT')?.rate).toBe(0.0003)
  })

  it('returns null for unknown symbol', () => {
    expect(tracker.get('ETH/USDT')).toBeUndefined()
  })

  it('classifies high positive funding correctly', () => {
    tracker.update(makeFunding(0.003))
    expect(tracker.sentiment('BTC/USDT')).toBe('extreme_long')
  })

  it('classifies high negative funding correctly', () => {
    tracker.update(makeFunding(-0.003))
    expect(tracker.sentiment('BTC/USDT')).toBe('extreme_short')
  })

  it('returns neutral for near-zero funding', () => {
    tracker.update(makeFunding(0.00001))
    expect(tracker.sentiment('BTC/USDT')).toBe('neutral')
  })

  it('tracks multiple symbols independently', () => {
    tracker.update(makeFunding(0.001, 'BTC/USDT'))
    tracker.update(makeFunding(-0.002, 'ETH/USDT'))
    expect(tracker.get('BTC/USDT')!.rate).toBe(0.001)
    expect(tracker.get('ETH/USDT')!.rate).toBe(-0.002)
  })
})
