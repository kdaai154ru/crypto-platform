// cores/trades-core/src/trade-buffer.ts
import type { NormalizedTrade } from '@crypto-platform/types'

export interface TradeBufferOptions {
  maxSize:         number
  flushIntervalMs: number
  onFlush:         (trades: NormalizedTrade[]) => Promise<void>
  // FIX #4: onFlushError callback replaces console.error.
  // Caller (main.ts) wires this to log.error + messagesFailedCounter
  // so flush failures are visible in pino logs and Prometheus metrics.
  onFlushError?:   (err: unknown, batch: NormalizedTrade[]) => void
}

export class TradeBuffer {
  private buf: NormalizedTrade[] = []
  private timer: ReturnType<typeof setInterval>
  // FIX #4: guard против параллельных onFlush вызовов
  private isFlushing = false

  constructor(private readonly opts: TradeBufferOptions) {
    this.timer = setInterval(() => {
      // FIX #4: route flush errors to onFlushError (pino + metrics) instead of console.error
      this.flush().catch((e) => this.opts.onFlushError?.(e, []))
    }, opts.flushIntervalMs)
  }

  push(trade: NormalizedTrade): void {
    this.buf.push(trade)
    if (this.buf.length >= this.opts.maxSize) {
      // FIX #4: route flush errors to onFlushError instead of console.error
      this.flush().catch((e) => this.opts.onFlushError?.(e, []))
    }
  }

  // FIX #4: public flush с isFlushing guard
  // Гарантирует: в любой момент выполняется не более одной записи в ClickHouse
  async flush(): Promise<void> {
    if (this.buf.length === 0 || this.isFlushing) return
    this.isFlushing = true
    const batch = this.buf.splice(0)
    try {
      await this.opts.onFlush(batch)
    } catch (e) {
      this.opts.onFlushError?.(e, batch)
      // Возвращаем батч обратно в буфер чтобы не потерять трейды
      this.buf.unshift(...batch)
    } finally {
      this.isFlushing = false
    }
  }

  // FIX #4: destroy сбрасывает буфер перед остановкой — данные не теряются при SIGTERM
  async destroy(): Promise<void> {
    clearInterval(this.timer)
    await this.flush()
  }
}
