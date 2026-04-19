// packages/types/src/exchange.ts

export type ExchangeId = string;

export type Timeframe =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d'
  | '3d'
  | '1w';

export type ExchangeStatus = 'online' | 'degraded' | 'offline';

export interface ExchangeState {
  id: ExchangeId;
  status: ExchangeStatus;
  lastHeartbeat: number;
  uptimeMs: number;
  error?: string;
}