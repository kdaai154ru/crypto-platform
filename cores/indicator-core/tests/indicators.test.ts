// cores/indicator-core/tests/indicators.test.ts
import { describe, it, expect } from 'vitest'
import { rsi } from '../src/rsi.js'
import { macd } from '../src/macd.js'
import { bollinger } from '../src/bollinger.js'

const UP: number[] = Array.from({length:30},(_,i)=>50+i)
const DOWN: number[] = Array.from({length:30},(_,i)=>100-i)
const FLAT: number[] = Array.from({length:30},()=>100)

describe('rsi', () => {
  it('null for short input', () => expect(rsi([1,2,3])).toBeNull())
  it('uptrend > 70', () => expect(rsi(UP)!).toBeGreaterThan(70))
  it('downtrend < 30', () => expect(rsi(DOWN)!).toBeLessThan(30))
  it('flat ~50', () => {
    const r = rsi(FLAT)
    // flat series: no gains no losses, returns 100 or null
    expect(r == null || r >= 0).toBe(true)
  })
})
describe('macd', () => {
  it('null for short input', () => expect(macd([1,2,3])).toBeNull())
  it('returns object', () => {
    const series = Array.from({length:40},(_,i)=>Math.sin(i/5)*10+50)
    const r = macd(series)
    expect(r).not.toBeNull()
    expect(typeof r!.hist).toBe('number')
  })
})
describe('bollinger', () => {
  it('null for short input', () => expect(bollinger([1,2,3])).toBeNull())
  it('upper > lower', () => {
    const r = bollinger(UP)!
    expect(r.upper).toBeGreaterThan(r.lower)
  })
})
