// cores/etf-core/src/etf-fetcher.ts
export interface ETFFlow {
  date:          string
  etfName:       string
  asset:         string
  flowUsd:       number
  aumUsd:        number
  holdingsCoin:  number
}

// Public CoinGlass ETF endpoint (no auth required for daily aggregate)
const COINGLASS_URL = 'https://open-api.coinglass.com/public/v2/etf/bitcoin-etf-flow-all-data'

export class ETFFetcher {
  async fetch(): Promise<ETFFlow[]> {
    try {
      const res = await fetch(COINGLASS_URL, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { data?: unknown[] }
      const data = json.data
      if (!Array.isArray(data)) return []
      return data.map((d: any) => ({
        date:         d.date ?? '',
        etfName:      d.ticker ?? d.etfName ?? 'Unknown',
        asset:        'BTC',
        flowUsd:      Number(d.flow ?? 0) * 1e6,
        aumUsd:       Number(d.totalAssets ?? 0) * 1e6,
        holdingsCoin: Number(d.totalBtc ?? 0),
      }))
    } catch (e) {
      console.error('[etf-fetcher] fetch error:', e)
      return []
    }
  }
}
