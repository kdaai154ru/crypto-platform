// packages/types/src/module.ts
export type ModuleStatus   = 'online'|'degraded'|'offline'|'restarting'
export type ExchangeStatus = 'connected'|'reconnecting'|'down'|'degraded'
export interface ModuleState {
  id:string; status:ModuleStatus
  lastHeartbeat:number; restarts:number
  error?:string; uptimeMs:number
}
export interface ExchangeState {
  id:string; status:ExchangeStatus
  latencyMs:number; lastMessageAt:number
  streamsActive:number; restarts:number; error?:string
}
export interface SystemStatusPayload {
  ts:number
  modules:ModuleState[]
  exchanges:ExchangeState[]
  activePairs:number
  activeClients:number
}
