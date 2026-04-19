// packages/types/src/system.ts
import type { ExchangeState } from './exchange.js';

export type ModuleStatus = 'online' | 'degraded' | 'restarting' | 'offline';

export interface ModuleState {
  id: string;
  status: ModuleStatus;
  lastHeartbeat: number;
  restarts: number;
  uptimeMs: number;
  error?: string;
}

export interface SystemStatusPayload {
  ts: number;
  modules: ModuleState[];
  exchanges: ExchangeState[];
  activePairs: number;
  activeClients: number;
}