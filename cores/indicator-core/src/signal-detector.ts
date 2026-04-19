// cores/indicator-core/src/signal-detector.ts
import { rsi } from './rsi.js'
import { macd } from './macd.js'
import { ema } from '@crypto-platform/utils'

export type SignalType =
  |'rsi_overbought'|'rsi_oversold'
  |'macd_bullish_cross'|'macd_bearish_cross'
  |'ema_golden_cross'|'ema_death_cross'
  |'bollinger_squeeze'

export interface Signal { type:SignalType; ts:number; value?:number; info?:string }

export function detectSignals(closes: number[], ts: number): Signal[] {
  const signals: Signal[] = []
  const r = rsi(closes)
  if (r != null) {
    if (r >= 70) signals.push({ type:'rsi_overbought', ts, value:r })
    if (r <= 30) signals.push({ type:'rsi_oversold',   ts, value:r })
  }
  const m = macd(closes)
  if (m != null) {
    if (m.hist > 0) signals.push({ type:'macd_bullish_cross', ts, value:m.hist })
    else            signals.push({ type:'macd_bearish_cross',  ts, value:m.hist })
  }
  const ema9  = ema(closes, 9)
  const ema21 = ema(closes, 21)
  if (ema9 != null && ema21 != null) {
    if (ema9 > ema21) signals.push({ type:'ema_golden_cross', ts })
    else              signals.push({ type:'ema_death_cross',  ts })
  }
  return signals
}
