// packages/types/src/derivatives.ts
export interface NormalizedOI {
  symbol:   string
  exchange: string
  oiUsd:    number
  oiCoin:   number
  ts:       number
}

export interface NormalizedFunding {
  symbol:        string
  exchange:      string
  rate:          number
  nextFundingTs: number
  ts:            number
}

export interface NormalizedLiquidation {
  symbol:   string
  exchange: string
  side:     'long' | 'short'
  price:    number
  qty:      number
  usdValue: number
  ts:       number
}
