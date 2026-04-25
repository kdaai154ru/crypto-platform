// packages/types/src/system.ts
import type { ExchangeState } from './exchange.js';

export type ModuleStatus = 'online' | 'degraded' | 'restarting' | 'offline';

export interface ModuleState {
  id: string;
  status: ModuleStatus;
  lastHeartbeat: number;
  restarts: number;
  uptimeMs: number;
  /** Unix ms timestamp when the module last transitioned to 'online' */
  startedAt: number;
  error?: string;
}

/** Safe public projection of ModuleState — no internal fields exposed */
export interface PublicModuleState {
  id: string;
  status: ModuleStatus;
}

export interface SystemStatusPayload {
  ts: number;
  modules: PublicModuleState[];
  exchanges: ExchangeState[];
  activePairs: number;
  activeClients: number;
}
