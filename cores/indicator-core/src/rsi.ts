// cores/indicator-core/src/rsi.ts
/** RSI — Wilder's Smoothed Moving Average */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  // FIX: work entirely on `slice` so Wilder loop indices stay in-bounds.
  // Previously the loop iterated `i < closes.length` which is the ORIGINAL
  // array — slice has length period+1, so period+1..closes.length is always
  // empty and Wilder smoothing was never applied.
  const slice = closes.slice(-period - 1)
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = slice[i]! - slice[i-1]!
    if (diff >= 0) gains += diff; else losses -= diff
  }
  let avgGain = gains / period, avgLoss = losses / period
  // FIX: iterate over slice (length = period+1), not the original closes array
  for (let i = period + 1; i < slice.length; i++) {
    const diff = slice[i]! - slice[i-1]!
    avgGain = (avgGain * (period-1) + Math.max(diff,0)) / period
    avgLoss = (avgLoss * (period-1) + Math.max(-diff,0)) / period
  }
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}
