// cores/options-core/src/analytics.ts
import type { DeribitOption } from './deribit-fetcher.js'

export interface OptionsAnalytics {
  symbol:  string
  ts:      number
  pcr:     number    // put/call ratio (OI)
  maxPain: number    // price where most options expire worthless
  gex:     number    // gamma exposure (simplified)
  expirations: Record<string, { callOI: number; putOI: number }>
}

export function computeOptionsAnalytics(
  symbol: string,
  options: DeribitOption[]
): OptionsAnalytics {
  let callOI = 0, putOI = 0
  const byExpiry: Record<string, { callOI: number; putOI: number }> = {}
  const strikeOI: Record<number, number> = {}

  for (const opt of options) {
    const oi = opt.open_interest ?? 0
    const exp = String(opt.expiration_timestamp)
    if (!byExpiry[exp]) byExpiry[exp] = { callOI: 0, putOI: 0 }

    if (opt.option_type === 'call') {
      callOI += oi
      byExpiry[exp]!.callOI += oi
    } else {
      putOI += oi
      byExpiry[exp]!.putOI += oi
    }

    strikeOI[opt.strike] = (strikeOI[opt.strike] ?? 0) + oi
  }

  // Max Pain: strike with highest total OI
  let maxPain = 0, maxOI = 0
  for (const [strike, oi] of Object.entries(strikeOI)) {
    if (oi > maxOI) { maxOI = oi; maxPain = Number(strike) }
  }

  // GEX simplified: sum(call_OI - put_OI) * strike * 100
  let gex = 0
  for (const opt of options) {
    const sign = opt.option_type === 'call' ? 1 : -1
    gex += sign * opt.open_interest * opt.strike * 100
  }

  return {
    symbol, ts: Date.now(),
    pcr: callOI === 0 ? 0 : putOI / callOI,
    maxPain, gex,
    expirations: byExpiry
  }
}
