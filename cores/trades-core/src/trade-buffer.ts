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
  // FIX #4: guard против параллельных onFlush вызовов
  private isFlushing = false

  constructor(private readonly opts: TradeBufferOptions) {
    this.timer = setInterval(() => { this.flush().catch(console.error) }, opts.flushIntervalMs)
  }

  push(trade: NormalizedTrade): void {
    this.buf.push(trade)
    // При достижении maxSize инициируем flush асинхронно
    if (this.buf.length >= this.opts.maxSize) {
      this.flush().catch(console.error)
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
      console.error(e)
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
