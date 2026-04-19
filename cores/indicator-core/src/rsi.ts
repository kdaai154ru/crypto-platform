// cores/indicator-core/src/rsi.ts
/** RSI — Wilder's Smoothed Moving Average */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  const slice = closes.slice(-period - 1)
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = slice[i]! - slice[i-1]!
    if (diff >= 0) gains += diff; else losses -= diff
  }
  let avgGain = gains / period, avgLoss = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i-1]!
    avgGain = (avgGain * (period-1) + Math.max(diff,0)) / period
    avgLoss = (avgLoss * (period-1) + Math.max(-diff,0)) / period
  }
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}
