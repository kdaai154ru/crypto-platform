// cores/derivatives-core/src/oi-tracker.ts
import type { NormalizedOI } from '@crypto-platform/types'

export class OITracker {
  private store = new Map<string, NormalizedOI[]>()
  private readonly maxHistory = 100

  update(oi: NormalizedOI): void {
    const key = `${oi.symbol}:${oi.exchange}`
    const arr = this.store.get(key) ?? []
    arr.push(oi)
    if (arr.length > this.maxHistory) arr.shift()
    this.store.set(key, arr)
  }

  latest(symbol: string, exchange: string): NormalizedOI | undefined {
    return this.store.get(`${symbol}:${exchange}`)?.at(-1)
  }

  history(symbol: string, exchange: string): NormalizedOI[] {
    return this.store.get(`${symbol}:${exchange}`) ?? []
  }

  /** OI change % vs N periods ago */
  oiChange(symbol: string, exchange: string, periods = 4): number | null {
    const hist = this.history(symbol, exchange)
    if (hist.length < periods + 1) return null
    const prev = hist[hist.length - 1 - periods]!.oiUsd
    const curr = hist[hist.length - 1]!.oiUsd
    return prev === 0 ? null : (curr - prev) / prev * 100
  }
}
