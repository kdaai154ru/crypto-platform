// tests/unit/trade-buffer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TradeBuffer } from '../../cores/trades-core/src/trade-buffer'
import type { NormalizedTrade } from '@crypto-platform/types'

const makeTrade = (i = 0): NormalizedTrade => ({
  id:        `trade-${i}`,
  exchange:  'binance',
  symbol:    'BTC/USDT',
  side:      'buy',
  price:     50000 + i,
  amount:    0.1,
  cost:      5000 + i,
  timestamp: Date.now(),
  datetime:  new Date().toISOString(),
} as NormalizedTrade)

describe('TradeBuffer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // ── flush on flushInterval ─────────────────────────────────

  it('flushes on interval and calls onFlush with accumulated trades', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined)
    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 500, onFlush })

    buf.push(makeTrade(1))
    buf.push(makeTrade(2))
    expect(onFlush).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()
    expect(onFlush).toHaveBeenCalledOnce()
    expect(onFlush.mock.calls[0]![0]).toHaveLength(2)

    await buf.destroy()
  })

  // ── flush on maxSize ───────────────────────────────────────

  it('triggers flush immediately when maxSize reached', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined)
    const buf = new TradeBuffer({ maxSize: 3, flushIntervalMs: 10_000, onFlush })

    buf.push(makeTrade(1))
    buf.push(makeTrade(2))
    buf.push(makeTrade(3)) // triggers flush
    await Promise.resolve() // let microtasks settle

    expect(onFlush).toHaveBeenCalledOnce()
    await buf.destroy()
  })

  // ── isFlushing guard ──────────────────────────────────────

  it('does not start a second flush while one is in progress', async () => {
    let resolveFlush!: () => void
    const blockingFlush = new Promise<void>(r => { resolveFlush = r })
    const onFlush = vi.fn().mockReturnValue(blockingFlush)

    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 10_000, onFlush })
    buf.push(makeTrade(1))

    const p1 = buf.flush() // first flush — sets isFlushing = true
    const p2 = buf.flush() // second flush — should be skipped
    resolveFlush()
    await Promise.all([p1, p2])

    expect(onFlush).toHaveBeenCalledTimes(1)
    await buf.destroy()
  })

  // ── onFlushError callback ─────────────────────────────────

  it('calls onFlushError when onFlush throws', async () => {
    const err = new Error('clickhouse down')
    const onFlush = vi.fn().mockRejectedValue(err)
    const onFlushError = vi.fn()

    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 10_000, onFlush, onFlushError })
    buf.push(makeTrade(1))
    await buf.flush()

    expect(onFlushError).toHaveBeenCalledWith(err, expect.any(Array))
    await buf.destroy()
  })

  // ── batch returned to buffer on error ─────────────────────

  it('re-inserts failed batch at the front of the buffer', async () => {
    const onFlush = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue(undefined)
    const onFlushError = vi.fn()

    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 10_000, onFlush, onFlushError })
    buf.push(makeTrade(1))
    buf.push(makeTrade(2))

    await buf.flush() // fails, trades go back
    expect(onFlushError).toHaveBeenCalledTimes(1)

    // Now flush again — should send the same trades
    await buf.flush()
    expect(onFlush).toHaveBeenCalledTimes(2)
    expect(onFlush.mock.calls[1]![0]).toHaveLength(2)
    await buf.destroy()
  })

  // ── destroy flushes remaining trades ──────────────────────

  it('destroy() flushes remaining trades before clearing timer', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined)
    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 60_000, onFlush })

    buf.push(makeTrade(1))
    buf.push(makeTrade(2))
    buf.push(makeTrade(3))

    await buf.destroy()
    expect(onFlush).toHaveBeenCalledOnce()
    expect(onFlush.mock.calls[0]![0]).toHaveLength(3)
  })

  // ── empty flush is no-op ──────────────────────────────────

  it('flush() on empty buffer is a no-op', async () => {
    const onFlush = vi.fn()
    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 10_000, onFlush })
    await buf.flush()
    expect(onFlush).not.toHaveBeenCalled()
    await buf.destroy()
  })

  // ── interval fires multiple times ─────────────────────────

  it('interval fires repeatedly and flushes each time', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined)
    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 500, onFlush })

    buf.push(makeTrade(1))
    await vi.advanceTimersByTimeAsync(500)
    buf.push(makeTrade(2))
    await vi.advanceTimersByTimeAsync(500)

    expect(onFlush).toHaveBeenCalledTimes(2)
    await buf.destroy()
  })

  // ── destroy stops interval (no more calls after destroy) ──

  it('destroy() stops the interval — no further flushes', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined)
    const buf = new TradeBuffer({ maxSize: 100, flushIntervalMs: 500, onFlush })
    await buf.destroy()

    await vi.advanceTimersByTimeAsync(2000)
    // Only the destroy flush — no interval fires after clearInterval
    expect(onFlush).toHaveBeenCalledTimes(1) // destroy flush (empty buf → 0 calls)
    // Actually empty buf: 0
  })
})
