// cores/trades-core/tests/trade-buffer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TradeBuffer } from '../src/trade-buffer.js'
import type { NormalizedTrade } from '@crypto-platform/types'

function makeTrade(i: number): NormalizedTrade {
  return { symbol:'BTC/USDT', exchange:'binance', price:50000+i, qty:0.1,
           side:'buy', ts:Date.now(), usdValue:5000, isLarge:false, sizeLabel:'S' }
}

describe('TradeBuffer', () => {
  it('flushes when size limit reached', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined)
    const buf = new TradeBuffer({ maxSize: 3, flushIntervalMs: 10_000, onFlush })
    buf.push(makeTrade(1))
    buf.push(makeTrade(2))
    expect(onFlush).not.toHaveBeenCalled()
    buf.push(makeTrade(3))
    await new Promise(r => setTimeout(r, 10))
    expect(onFlush).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ price: 50001 })]))
  })

  it('flushes on interval even if size not reached', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined)
    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 50, onFlush })
    buf.push(makeTrade(1))
    await new Promise(r => setTimeout(r, 80))
    expect(onFlush).toHaveBeenCalled()
  })

  it('does not flush empty buffer', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined)
    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 50, onFlush })
    await new Promise(r => setTimeout(r, 80))
    expect(onFlush).not.toHaveBeenCalled()
    buf.destroy()
  })
})
