// cores/trades-core/src/trade-processor.ts
import type { NormalizedTrade } from '@crypto-platform/types'
import type { Logger } from '@crypto-platform/logger'

export interface DeltaResult { buyVol:number; sellVol:number; delta:number; symbol:string }

// FIX: ограничение размера re-буфера — при длительном сбое ClickHouse буфер растёт без границ → OOM
const MAX_BUFFER_SIZE = 50_000;

export class TradeProcessor {
  private buffer: NormalizedTrade[] = []
  private flushTimer?: ReturnType<typeof setInterval>
  private deltaMap = new Map<string, { buy:number; sell:number; ts:number }>()

  constructor(
    private readonly log: Logger,
    private readonly onFlush: (trades:NormalizedTrade[]) => Promise<void>,
    private readonly onDelta: (d:DeltaResult) => void,
    flushIntervalMs = 2_000
  ) {
    this.flushTimer = setInterval(() => this.flush(), flushIntervalMs)
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
      d.ts = Date.now()
    }
  }

  private async flush(): Promise<void> {
    if (!this.buffer.length) return
    const batch = this.buffer.splice(0)
    try {
      await this.onFlush(batch)
    } catch (e) {
      this.log.error(e, 'flush error, re-buffering')
      // FIX: если буфер уже переполнен — дропаем батч, чтобы не допустить OOM
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

  destroy(): void { clearInterval(this.flushTimer) }
}
