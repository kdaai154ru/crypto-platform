// cores/screener-core/src/screener-engine.ts
import type { NormalizedCandle, ScreenerRow } from '@crypto-platform/types'

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

// FIX(audit): кэш RSI чтобы не пересчитывать при каждом getRows() если данные не изменились
interface RsiCache {
  value: number
  candleCount: number
}

/**
 * FIX(audit): Wilder's Smoothing (EMA-based RSI) — стандарт TradingView/биржей.
 * Простое среднее (SMA) давало значительное расхождение с реальным RSI.
 *
 * Алгоритм:
 *  1. Первый RSI_PERIOD — SMA для начального avgGain/avgLoss
 *  2. Далее: avgGain = (prev * (N-1) + curr) / N  (Wilder's EMA, α = 1/N)
 */
function computeRsi(closes: number[]): number | null {
  if (closes.length < RSI_PERIOD + 1) return null

  // Шаг 1: начальные средние по первым RSI_PERIOD изменениям
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= RSI_PERIOD; i++) {
    const diff = closes[i]! - closes[i - 1]!
    if (diff > 0) avgGain += diff
    else avgLoss += Math.abs(diff)
  }
  avgGain /= RSI_PERIOD
  avgLoss /= RSI_PERIOD

  // Шаг 2: Wilder's smoothing для оставшихся точек
  for (let i = RSI_PERIOD + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? Math.abs(diff) : 0
    avgGain = (avgGain * (RSI_PERIOD - 1) + gain) / RSI_PERIOD
    avgLoss = (avgLoss * (RSI_PERIOD - 1) + loss) / RSI_PERIOD
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export class ScreenerEngine {
  private candles: CandleStore = {}
  private rsiCache = new Map<string, RsiCache>()
  onClose?: (row: ScreenerRow) => void

  constructor(private readonly opts: ScreenerEngineOptions) {}

  update(candle: NormalizedCandle): void {
    const { symbol, tf } = candle
    if (!this.candles[symbol]) this.candles[symbol] = {}
    if (!this.candles[symbol]![tf]) this.candles[symbol]![tf] = []
    const arr = this.candles[symbol]![tf]!
    arr.push(candle)
    if (arr.length > 200) arr.shift()
    this.rsiCache.delete(`${symbol}:${tf}`)
  }

  warmUp(symbol: string, tf: string, candles: NormalizedCandle[]): void {
    if (!this.candles[symbol]) this.candles[symbol] = {}
    this.candles[symbol]![tf] = candles.slice(-200)
    this.rsiCache.delete(`${symbol}:${tf}`)
  }

  getRow(symbol: string, tf: string, screener: ScreenerType): ScreenerRow | null {
    const arr = this.candles[symbol]?.[tf]
    if (!arr || arr.length < RSI_PERIOD + 1) return null
    const closes = arr.map(c => c.close)

    let value: number | null = null

    if (screener === 'rsi') {
      const cacheKey = `${symbol}:${tf}`
      const cached = this.rsiCache.get(cacheKey)
      if (cached && cached.candleCount === arr.length) {
        value = cached.value
      } else {
        value = computeRsi(closes)
        if (value !== null) {
          this.rsiCache.set(cacheKey, { value, candleCount: arr.length })
        }
      }
    }

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

  stats(): { symbols: number; cachedRsi: number } {
    return {
      symbols: Object.keys(this.candles).length,
      cachedRsi: this.rsiCache.size,
    }
  }
}
