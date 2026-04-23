// packages/types/src/index.ts

export type ModuleStatus = 'online' | 'offline' | 'degraded' | 'restarting';

export interface ModuleState {
  id: string;
  status: ModuleStatus;
  lastHeartbeat: number;
  restarts: number;
  uptimeMs: number;
  startedAt: number;
  error?: string;
}

export interface ExchangeState {
  id: string;
  status: 'connected' | 'disconnected' | 'error';
  latency?: number;
  lastUpdate?: number;
}

export interface PublicModuleState {
  id: string;
  status: string;
}

export interface SystemStatusPayload {
  ts: number;
  modules: PublicModuleState[];
  exchanges: ExchangeState[];
  activePairs: number;
  activeClients: number;
}

// Другие возможные типы проекта
export interface Trade {
  id: string;
  symbol: string;
  price: number;
  amount: number;
  side: 'buy' | 'sell';
  timestamp: number;
  exchange: string;
}

export interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: number;
  exchange: string;
}

export interface Candle {
  symbol: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  exchange: string;
}

export interface Alert {
  id: string;
  type: string;
  symbol?: string;
  condition: any;
  triggered: boolean;
  createdAt: number;
}