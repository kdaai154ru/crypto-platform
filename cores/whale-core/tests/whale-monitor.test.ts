// cores/whale-core/tests/whale-monitor.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { WhaleMonitor } from '../src/whale-monitor.js'
import type { NormalizedTrade } from '@crypto-platform/types'

function trade(usdValue: number, side: 'buy'|'sell' = 'buy'): NormalizedTrade {
  return { symbol:'BTC/USDT', exchange:'binance', price:50000,
           qty: usdValue/50000, side, ts: Date.now(),
           usdValue, isLarge: usdValue >= 100_000, sizeLabel:'XL' }
}

describe('WhaleMonitor', () => {
  let mon: WhaleMonitor

  beforeEach(() => { mon = new WhaleMonitor() })

  it('ignores trades below $100k', () => {
    expect(mon.process(trade(50_000))).toBeNull()
    expect(mon.process(trade(99_999))).toBeNull()
  })

  it('classifies $100k-$499k as large', () => {
    const ev = mon.process(trade(150_000))
    expect(ev).not.toBeNull()
    expect(ev!.tier).toBe('large')
  })

  it('classifies $500k-$999k as xlarge', () => {
    const ev = mon.process(trade(600_000))
    expect(ev!.tier).toBe('xlarge')
  })

  it('classifies $1M+ as mega', () => {
    const ev = mon.process(trade(1_500_000))
    expect(ev!.tier).toBe('mega')
  })

  it('stores events and returns recent', () => {
    mon.process(trade(200_000, 'buy'))
    mon.process(trade(300_000, 'sell'))
    mon.process(trade(1_000_000, 'buy'))
    const recent = mon.recent(10)
    expect(recent.length).toBe(3)
    expect(recent[2]!.tier).toBe('mega')
  })

  it('caps buffer at 200 events', () => {
    for (let i = 0; i < 210; i++) mon.process(trade(100_000 + i))
    expect(mon.recent(300).length).toBe(200)
  })
})
