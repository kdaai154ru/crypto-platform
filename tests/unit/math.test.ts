// tests/unit/math.test.ts
import { describe, it, expect } from 'vitest'
import { clamp, round, sma, ema, stddev, atr } from '../../packages/utils/src/math'

describe('clamp', () => {
  it('returns value within range unchanged', () => expect(clamp(5, 0, 10)).toBe(5))
  it('clamps to lower bound', () => expect(clamp(-5, 0, 10)).toBe(0))
  it('clamps to upper bound', () => expect(clamp(15, 0, 10)).toBe(10))
  it('handles value equal to lower bound', () => expect(clamp(0, 0, 10)).toBe(0))
  it('handles value equal to upper bound', () => expect(clamp(10, 0, 10)).toBe(10))
})

describe('round', () => {
  it('rounds to 2 decimal places by default', () => expect(round(3.14159)).toBe(3.14))
  it('rounds to specified decimal places', () => expect(round(3.14159, 4)).toBe(3.1416))
  it('rounds 0.5 up', () => expect(round(0.005, 2)).toBe(0.01))
  it('handles integers', () => expect(round(42)).toBe(42))
})

describe('sma', () => {
  const v = [1, 2, 3, 4, 5]

  it('returns null when insufficient data', () => expect(sma(v, 10)).toBeNull())
  it('computes SMA(5) correctly', () => expect(sma(v, 5)).toBe(3))
  it('uses only last p values', () => expect(sma([1, 2, 3, 4, 5, 6], 3)).toBe(5))
  it('handles period = 1', () => expect(sma([42], 1)).toBe(42))
  it('returns null for empty array', () => expect(sma([], 3)).toBeNull())
})

describe('ema', () => {
  it('returns null when insufficient data', () => expect(ema([1, 2], 5)).toBeNull())
  it('returns SMA value when exactly p values provided', () => {
    const result = ema([1, 2, 3, 4, 5], 5)
    expect(result).toBe(3)
  })
  it('updates correctly with additional values', () => {
    // EMA(3) with [1,2,3] = 2, then value 4:
    // k = 2/(3+1) = 0.5; ema = 4*0.5 + 2*0.5 = 3
    const result = ema([1, 2, 3, 4], 3)
    expect(result).toBeCloseTo(3, 5)
  })
  it('returns null for empty array', () => expect(ema([], 3)).toBeNull())
})

describe('stddev', () => {
  it('returns null for single value', () => expect(stddev([5])).toBeNull())
  it('returns null for empty array', () => expect(stddev([])).toBeNull())
  it('computes stddev for [2, 4, 4, 4, 5, 5, 7, 9]', () => {
    // sample stddev = 2
    const result = stddev([2, 4, 4, 4, 5, 5, 7, 9])
    expect(result).toBeCloseTo(2, 5)
  })
  it('returns 0 for all identical values', () => {
    expect(stddev([3, 3, 3, 3])).toBe(0)
  })
})

describe('atr', () => {
  // Need p+1 = 15 candles minimum for ATR(14)
  const gen = (n: number) => Array.from({ length: n }, (_, i) => i + 10)

  it('returns null when insufficient data', () => {
    const h = gen(10), l = gen(10), c = gen(10)
    expect(atr(h, l, c, 14)).toBeNull()
  })

  it('computes ATR with sufficient data', () => {
    const highs  = Array.from({ length: 20 }, (_, i) => 100 + i + 1)
    const lows   = Array.from({ length: 20 }, (_, i) => 100 + i - 1)
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const result = atr(highs, lows, closes, 14)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

  it('returns null for empty arrays', () => {
    expect(atr([], [], [], 14)).toBeNull()
  })
})
