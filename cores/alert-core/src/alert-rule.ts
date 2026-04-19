// cores/alert-core/src/alert-rule.ts
export type AlertCondition = 'gt'|'lt'|'gte'|'lte'|'eq'|'cross_up'|'cross_down'
export type AlertChannel   = 'in_app'|'telegram'|'email'|'webhook'
export interface AlertRule {
  id:string; userId:string
  symbol:string; metric:string
  condition:AlertCondition; threshold:number
  channels:AlertChannel[]
  cooldownMs:number; enabled:boolean
  lastTriggered?:number
}
