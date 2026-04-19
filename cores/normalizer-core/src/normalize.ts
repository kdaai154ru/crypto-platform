// cores/normalizer-core/src/normalize.ts
import type { NormalizedTrade, NormalizedTicker, NormalizedCandle, ExchangeId, Timeframe } from '@crypto-platform/types'
import { normalizeSymbol } from '@crypto-platform/utils'

const LARGE_TRADE_USD = 100_000

function sizeLabel(usd:number): 'S'|'M'|'L'|'XL' {
  if(usd>100_000) return 'XL'
  if(usd>10_000)  return 'L'
  if(usd>1_000)   return 'M'
  return 'S'
}

export function normalizeTrade(raw:Record<string,unknown>, exchange:ExchangeId): NormalizedTrade|null {
  const sym = normalizeSymbol(String(raw.symbol??''))
  if(!sym) return null
  const price = Number(raw.price??0), qty = Number(raw.amount??0)
  const usdValue = price * qty
  return {
    symbol:sym, exchange, ts:Number(raw.timestamp??Date.now()),
    side:String(raw.side??'buy')==='sell'?'sell':'buy',
    price, qty, usdValue, isLarge:usdValue>=LARGE_TRADE_USD,
    tradeId:String(raw.id??''), sizeLabel:sizeLabel(usdValue)
  }
}

export function normalizeTicker(raw:Record<string,unknown>, exchange:ExchangeId): NormalizedTicker|null {
  const sym = normalizeSymbol(String(raw.symbol??''))
  if(!sym) return null
  const bid=Number(raw.bid??0), ask=Number(raw.ask??0)
  return { symbol:sym, exchange, ts:Number(raw.timestamp??Date.now()),
    last:Number(raw.last??0), bid, ask, spread:ask-bid,
    vol24h:Number(raw.quoteVolume??0), change24h:Number(raw.percentage??0),
    high24h:Number(raw.high??0), low24h:Number(raw.low??0) }
}

export function normalizeCandle(raw:number[], symbol:string, tf:Timeframe, exchange:ExchangeId, isClosed=false): NormalizedCandle|null {
  const sym = normalizeSymbol(symbol)
  if(!sym||raw.length<5) return null
  return { symbol:sym, exchange, ts:raw[0]!, tf,
    open:raw[1]!, high:raw[2]!, low:raw[3]!, close:raw[4]!,
    volume:raw[5]??0, buyVolume:0, sellVolume:0, isClosed }
}
