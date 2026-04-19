// cores/indicator-core/src/bollinger.ts
import { sma, stddev } from '@crypto-platform/utils'
import type { BBResult } from '@crypto-platform/types';
import type { MACDResult } from '@crypto-platform/types';

export function bollinger(closes: number[], period=20, mult=2): BBResult | null {
  const mid = sma(closes, period)
  const std = stddev(closes.slice(-period))
  if (mid == null || std == null) return null
  const upper = mid + mult * std, lower = mid - mult * std
  return { upper, middle:mid, lower, width:(upper-lower)/mid }
}
