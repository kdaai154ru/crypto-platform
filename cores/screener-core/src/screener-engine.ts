// cores/screener-core/src/screener-engine.ts
import type { NormalizedCandle, ScreenerRow } from '@crypto-platform/types'
import { sma } from '@crypto-platform/utils'

export interface ScreenerEngineOptions {
  tfs:      string[]
  maxPairs: number
}

type ScreenerType = 'rsi' | 'macd' | 'ema'

interface CandleStore {
  [symbol: string]: {
    [tf: string]: NormalizedCandle[]
  }
}

const RSI_PERIOD = 14

function computeRsi(closes: number[]): number | null {
  if (closes.length < RSI_PERIOD + 1) return null
  const slice = closes.slice(-RSI_PERIOD - 1)
  let gains = 0, losses = 0
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i]! - slice[i - 1]!
    if (diff > 0) gains += diff
    else losses += Math.abs(diff)
  }
  const avgGain = gains / RSI_PERIOD
  const avgLoss = losses / RSI_PERIOD
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export class ScreenerEngine {
  private candles: CandleStore = {}
  onClose?: (row: ScreenerRow) => void

  constructor(private readonly opts: ScreenerEngineOptions) {}

  update(candle: NormalizedCandle): void {
    const { symbol, tf } = candle
    if (!this.candles[symbol]) this.candles[symbol] = {}
    if (!this.candles[symbol]![tf]) this.candles[symbol]![tf] = []
    const arr = this.candles[symbol]![tf]!
    arr.push(candle)
    if (arr.length > 200) arr.shift()
  }

  getRow(symbol: string, tf: string, screener: ScreenerType): ScreenerRow | null {
    const arr = this.candles[symbol]?.[tf]
    if (!arr || arr.length < RSI_PERIOD + 1) return null
    const closes = arr.map(c => c.close)

    let value: number | null = null
    if (screener === 'rsi') value = computeRsi(closes)

    if (value === null) return null
    return { symbol, tf, screener, value, ts: Date.now() }
  }

  getRows(screener: ScreenerType): ScreenerRow[] {
    const rows: ScreenerRow[] = []
    for (const symbol of Object.keys(this.candles)) {
      for (const tf of this.opts.tfs) {
        const row = this.getRow(symbol, tf, screener)
        if (row) rows.push(row)
      }
    }
    return rows
  }
}
