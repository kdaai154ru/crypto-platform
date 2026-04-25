// cores/trades-core/src/trade-processor.ts
import type { NormalizedTrade } from '@crypto-platform/types'
import type { Logger } from '@crypto-platform/logger'

export interface DeltaResult { buyVol:number; sellVol:number; delta:number; symbol:string }

// FIX: ограничение размера re-буфера — при длительном сбое ClickHouse буфер растёт без границ → OOM
const MAX_BUFFER_SIZE = 50_000;
// FIX #4: stale threshold — записи deltaMap старше этого интервала удаляются
const DELTA_STALE_MS = 5 * 60_000; // 5 minutes

export class TradeProcessor {
  private buffer: NormalizedTrade[] = []
  private flushTimer?: ReturnType<typeof setInterval>
  private cleanupTimer?: ReturnType<typeof setInterval>
  private deltaMap = new Map<string, { buy:number; sell:number; ts:number }>()

  constructor(
    private readonly log: Logger,
    private readonly onFlush: (trades:NormalizedTrade[]) => Promise<void>,
    private readonly onDelta: (d:DeltaResult) => void,
    flushIntervalMs = 2_000
  ) {
    this.flushTimer = setInterval(() => this.flush(), flushIntervalMs)
    // FIX #4: periodic cleanup of stale deltaMap entries to prevent memory leak
    this.cleanupTimer = setInterval(() => this.pruneDeltaMap(), 60_000)
  }

  // FIX #4: remove deltaMap entries that haven't been updated for DELTA_STALE_MS
  private pruneDeltaMap(): void {
    const now = Date.now()
    let pruned = 0
    for (const [symbol, d] of this.deltaMap) {
      if (now - d.ts > DELTA_STALE_MS) {
        this.deltaMap.delete(symbol)
        pruned++
      }
    }
    if (pruned > 0) {
      this.log.debug({ pruned }, 'deltaMap: pruned stale symbols')
    }
  }

  process(trade: NormalizedTrade): void {
    this.buffer.push(trade)
    let d = this.deltaMap.get(trade.symbol)
    if (!d || Date.now() - d.ts > 60_000) {
      d = { buy:0, sell:0, ts:Date.now() }
      this.deltaMap.set(trade.symbol, d)
    }
    if (trade.side==='buy') d.buy += trade.usdValue
    else d.sell += trade.usdValue
    if (Date.now() - d.ts >= 500) {
      this.onDelta({ symbol:trade.symbol, buyVol:d.buy, sellVol:d.sell, delta:d.buy-d.sell })
      d.buy = 0
      d.sell = 0
      d.ts = Date.now()
    }
  }

  async flush(): Promise<void> {
    if (!this.buffer.length) return
    const batch = this.buffer.splice(0)
    try {
      await this.onFlush(batch)
    } catch (e) {
      this.log.error(e, 'flush error, re-buffering')
      if (this.buffer.length < MAX_BUFFER_SIZE) {
        this.buffer.unshift(...batch)
      } else {
        this.log.error(
          { dropped: batch.length, bufferSize: this.buffer.length },
          'Buffer overflow: dropping batch to prevent OOM'
        )
      }
    }
  }

  destroy(): void {
    clearInterval(this.flushTimer)
    // FIX #4: clear cleanup timer and deltaMap on shutdown
    clearInterval(this.cleanupTimer)
    this.deltaMap.clear()
  }
}
