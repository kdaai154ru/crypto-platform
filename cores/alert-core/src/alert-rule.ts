// cores/alert-core/src/alert-rule.ts
import { z } from 'zod';

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

// FIX: zod-схема для runtime-валидации правил из Redis
// JSON.parse as AlertRule — небезопасный type assertion без проверки структуры
export const AlertRuleSchema = z.object({
  id:          z.string().min(1),
  userId:      z.string().min(1),
  symbol:      z.string().min(1),
  metric:      z.string().min(1),
  condition:   z.enum(['gt','lt','gte','lte','eq','cross_up','cross_down']),
  threshold:   z.number(),
  channels:    z.array(z.enum(['in_app','telegram','email','webhook'])).min(1),
  cooldownMs:  z.number().int().min(0),
  enabled:     z.boolean(),
  lastTriggered: z.number().optional(),
});

export function parseAlertRule(raw: string): AlertRule | null {
  try {
    const parsed = AlertRuleSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data as AlertRule;
  } catch {
    return null;
  }
}
