// cores/indicator-core/src/macd.ts
import { ema } from '@crypto-platform/utils'
import type { BBResult } from '@crypto-platform/types';
import type { MACDResult } from '@crypto-platform/types';

export function macd(closes: number[], fast=12, slow=26, signal=9): MACDResult | null {
  if (closes.length < slow + signal) return null
  const f = ema(closes, fast), s = ema(closes, slow)
  if (f == null || s == null) return null
  const macdLine = f - s
  const prevMacdLines = []
  for (let i = slow; i < closes.length; i++) {
    const fe = ema(closes.slice(0,i+1), fast), se = ema(closes.slice(0,i+1), slow)
    if (fe != null && se != null) prevMacdLines.push(fe - se)
  }
  const sig = ema(prevMacdLines, signal)
  if (sig == null) return null
  return { macd: macdLine, signal: sig, hist: macdLine - sig }
}
