// cores/indicator-core/src/adx.ts
import { atr } from '@crypto-platform/utils'

export function adx(highs:number[], lows:number[], closes:number[], period=14): number | null {
  if (highs.length < period * 2) return null
  const a = atr(highs, lows, closes, period)
  if (!a) return null
  const dms: number[] = []
  for (let i = 1; i < highs.length; i++) {
    const pDM = Math.max(highs[i]!-highs[i-1]!, 0)
    const nDM = Math.max(lows[i-1]!-lows[i]!, 0)
    dms.push(pDM > nDM ? pDM : -nDM)
  }
  const avg = dms.slice(-period).reduce((a,b)=>a+b,0)/period
  return Math.abs(avg/a) * 100
}
