// cores/screener-core/tests/screener-engine.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ScreenerEngine } from '../src/screener-engine.js'
import type { NormalizedCandle } from '@crypto-platform/types'

function makeCandle(close: number, ts: number): NormalizedCandle {
  return { symbol:'BTC/USDT', exchange:'binance', tf:'1h',
           open:close-10, high:close+20, low:close-20, close, volume:100,
           buyVolume:55, sellVolume:45, ts }
}

describe('ScreenerEngine', () => {
  let engine: ScreenerEngine

  beforeEach(() => {
    engine = new ScreenerEngine({ tfs:['1h'], maxPairs: 10 })
  })

  it('returns null when not enough candles for RSI', () => {
    for (let i = 0; i < 5; i++) engine.update(makeCandle(100 + i, i * 60_000))
    const row = engine.getRow('BTC/USDT', '1h', 'rsi')
    expect(row).toBeNull()
  })

  it('computes RSI after 14+ candles', () => {
    for (let i = 0; i < 20; i++) engine.update(makeCandle(100 + (i % 5), i * 60_000))
    const row = engine.getRow('BTC/USDT', '1h', 'rsi')
    expect(row).not.toBeNull()
    expect(row!.value).toBeGreaterThan(0)
    expect(row!.value).toBeLessThan(100)
  })

  it('returns all rows for a screener type', () => {
    engine = new ScreenerEngine({ tfs:['1h'], maxPairs:10 })
    for (let i = 0; i < 20; i++) engine.update(makeCandle(100 + i, i * 60_000))
    const rows = engine.getRows('rsi')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveProperty('symbol')
    expect(rows[0]).toHaveProperty('tf')
    expect(rows[0]).toHaveProperty('value')
    expect(rows[0]).toHaveProperty('screener', 'rsi')
  })
})
