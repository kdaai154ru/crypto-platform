// packages/types/src/alert.ts
export type AlertCondition = 'greater_than' | 'less_than' | 'crosses_above' | 'crosses_below'
export type AlertChannel   = 'in_app' | 'telegram' | 'email'

export interface AlertRule {
  id:           string
  userId:       string
  symbol:       string
  metric:       string
  condition:    AlertCondition
  threshold:    number
  cooldownMs:   number
  channels:     AlertChannel[]
  enabled:      boolean
  createdAt:    number
  lastFiredAt?: number
}

export interface AlertEvent {
  ruleId:  string
  symbol:  string
  metric:  string
  value:   number
  firedAt: number
}
