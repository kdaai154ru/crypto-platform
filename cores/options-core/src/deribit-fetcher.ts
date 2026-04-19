// cores/options-core/src/deribit-fetcher.ts
// Deribit public API — no auth required for market data

const BASE = 'https://www.deribit.com/api/v2/public'

export interface DeribitOption {
  instrument_name: string
  strike: number
  option_type: 'call' | 'put'
  open_interest: number
  volume: number
  mark_price: number
  expiration_timestamp: number
}

export class DeribitFetcher {
  async getInstruments(currency: 'BTC' | 'ETH' = 'BTC'): Promise<DeribitOption[]> {
    try {
      const url = `${BASE}/get_instruments?currency=${currency}&kind=option&expired=false`
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { result: DeribitOption[] }
      return json.result ?? []
    } catch (e) {
      console.error('[deribit] instruments error:', e)
      return []
    }
  }

  async getOrderBook(instrument: string): Promise<{ open_interest: number; volume: number } | null> {
    try {
      const url = `${BASE}/get_order_book?instrument_name=${instrument}&depth=1`
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (!res.ok) return null
      const json = await res.json() as { result: { open_interest: number; volume: number } }
      return json.result
    } catch {
      return null
    }
  }
}
