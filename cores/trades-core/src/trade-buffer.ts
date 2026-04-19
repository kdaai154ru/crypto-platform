// cores/trades-core/src/trade-buffer.ts
import type { NormalizedTrade } from '@crypto-platform/types'

export interface TradeBufferOptions {
  maxSize:         number
  flushIntervalMs: number
  onFlush:         (trades: NormalizedTrade[]) => Promise<void>
}

export class TradeBuffer {
  private buf: NormalizedTrade[] = []
  private timer: ReturnType<typeof setInterval>

  constructor(private readonly opts: TradeBufferOptions) {
    this.timer = setInterval(() => this.tryFlush(), opts.flushIntervalMs)
  }

  push(trade: NormalizedTrade): void {
    this.buf.push(trade)
    if (this.buf.length >= this.opts.maxSize) this.tryFlush()
  }

  private tryFlush(): void {
    if (this.buf.length === 0) return
    const batch = this.buf.splice(0)
    this.opts.onFlush(batch).catch(console.error)
  }

  destroy(): void { clearInterval(this.timer) }
}
