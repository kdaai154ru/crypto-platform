// packages/types/src/market.ts
export type TradeSide = 'buy' | 'sell'
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' | '1w'

export interface NormalizedTrade {
  symbol:    string
  exchange:  string
  price:     number
  qty:       number
  side:      TradeSide
  ts:        number
  usdValue:  number
  isLarge:   boolean
  sizeLabel: string
  tradeId?:  string
}

export interface NormalizedTicker {
  symbol:    string
  exchange:  string
  last:      number
  bid:       number
  ask:       number
  volume24h: number
  change24h: number
  high24h:   number
  low24h:    number
  ts:        number
}

export interface NormalizedCandle {
  symbol:     string
  exchange:   string
  tf:         string
  open:       number
  high:       number
  low:        number
  close:      number
  volume:     number
  buyVolume:  number
  sellVolume: number
  ts:         number
}
