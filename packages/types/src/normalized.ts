// packages/types/src/normalized.ts
import type { ExchangeId, Timeframe } from './exchange.js';

export type TradeSide = 'buy' | 'sell';

export interface NormalizedTrade {
  symbol: string;
  exchange: ExchangeId;
  ts: number;
  side: TradeSide;
  price: number;
  qty: number;
  usdValue: number;
  isLarge: boolean;
  tradeId?: string;
  sizeLabel: 'S' | 'M' | 'L' | 'XL';
}

export interface NormalizedTicker {
  symbol: string;
  exchange: ExchangeId;
  ts: number;
  last: number;
  bid: number;
  ask: number;
  spread: number;        // ← обязательно есть
  vol24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
}

export interface NormalizedCandle {
  symbol: string;
  exchange: ExchangeId;
  ts: number;
  tf: Timeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  isClosed: boolean;     // ← обязательно есть
}

export interface NormalizedFunding {
  symbol: string;
  exchange: ExchangeId;
  ts: number;
  rate: number;
  nextTs: number;
}

export interface NormalizedOI {
  symbol: string;
  exchange: ExchangeId;
  ts: number;
  oiUsd: number;
  oiCoin: number;
}

export interface NormalizedLiquidation {
  symbol: string;
  exchange: ExchangeId;
  ts: number;
  side: 'long' | 'short';
  price: number;
  qty: number;
  usdValue: number;
}