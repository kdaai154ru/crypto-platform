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
// FIX: кэш RSI чтобы не пересчитывать при каждом getRows() если данные не изменились
interface RsiCache {
  value: number
  candleCount: number  // длина массива на момент вычисления
}

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
  // FIX: кэш вычисленных RSI — ключ: `${symbol}:${tf}`
  // Инвалидируется когда candleCount изменился (пришла новая свеча)
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
    // Инвалидируем кэш RSI для этой пары при новой свече
    this.rsiCache.delete(`${symbol}:${tf}`)
  }

  // FIX: warm-up метод — позволяет загрузить исторические свечи при старте
  // Вызывается из main.ts перед началом обработки потока
  warmUp(symbol: string, tf: string, candles: NormalizedCandle[]): void {
    if (!this.candles[symbol]) this.candles[symbol] = {}
    // берём последние 200 (лимит хранилища)
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
      // FIX: используем кэш если количество свечей не изменилось
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

  // Статистика для healthcheck / debug
  stats(): { symbols: number; cachedRsi: number } {
    return {
      symbols: Object.keys(this.candles).length,
      cachedRsi: this.rsiCache.size,
    }
  }
}
