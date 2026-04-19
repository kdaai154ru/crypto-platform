// cores/normalizer-core/tests/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeTrade, normalizeTicker, normalizeCandle } from '../src/normalize.js'

describe('normalizeTrade', () => {
  it('normalizes BTCUSDT buy', () => {
    const t = normalizeTrade({symbol:'BTCUSDT',side:'buy',price:50000,amount:1,timestamp:1000,id:'1'},'binance')
    expect(t?.symbol).toBe('BTC/USDT')
    expect(t?.sizeLabel).toBe('XL')
    expect(t?.isLarge).toBe(true)
  })
  it('returns null for non-USDT', () => {
    expect(normalizeTrade({symbol:'BTCBNB',price:1,amount:1,timestamp:1},'binance')).toBeNull()
  })
  it('S label for small trade', () => {
    const t = normalizeTrade({symbol:'BTC/USDT',side:'sell',price:100,amount:0.001,timestamp:1},'binance')
    expect(t?.sizeLabel).toBe('S')
  })
})
describe('normalizeTicker', () => {
  it('computes spread', () => {
    const t = normalizeTicker({symbol:'BTC/USDT',last:100,bid:99,ask:101,timestamp:1},'bybit')
    expect(t?.spread).toBeCloseTo(2)
  })
})
describe('normalizeCandle', () => {
  it('maps correctly', () => {
    const c = normalizeCandle([1000,100,110,90,105,1000], 'BTC/USDT', '1m', 'binance')
    expect(c?.open).toBe(100); expect(c?.close).toBe(105)
  })
  it('null for BTC/BNB', () => {
    expect(normalizeCandle([1,1,1,1,1],'BTC/BNB','1m','binance')).toBeNull()
  })
})
