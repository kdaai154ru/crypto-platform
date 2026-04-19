// packages/types/src/indicator.ts

export interface BBResult {
  upper: number;
  middle: number;
  lower: number;
  width: number;
}

export interface MACDResult {
  macd: number;
  signal: number;
  hist: number;
}