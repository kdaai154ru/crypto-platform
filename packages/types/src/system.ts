// packages/types/src/system.ts
import type { ExchangeState } from './exchange.js';

export type ModuleStatus = 'online' | 'degraded' | 'restarting' | 'offline';

export interface ModuleState {
  id: string;
  status: ModuleStatus;
  lastHeartbeat: number;
  restarts: number;
  uptimeMs: number;
  /** Unix ms когда модуль последний раз перешёл в 'online' */
  startedAt: number;
  error?: string;
}

/** Public projection — всё необходимое для фронта */
export interface PublicModuleState {
  id: string;
  status: ModuleStatus;
  uptimeMs: number;
  startedAt: number;
  restarts: number;
  error?: string;
}

export interface SystemStatusPayload {
  ts: number;
  modules: PublicModuleState[];
  exchanges: ExchangeState[];
  activePairs: number;
  activeClients: number;
}
