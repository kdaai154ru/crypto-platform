// cores/alert-core/src/alert-evaluator.ts
import type { AlertRule } from './alert-rule.js'
import type { Logger } from '@crypto-platform/logger'

export interface AlertEvent { ruleId:string; symbol:string; metric:string; value:number; ts:number }

export class AlertEvaluator {
  private prevValues = new Map<string,number>()

  constructor(private readonly log: Logger) {}

  evaluate(rules: AlertRule[], metric: string, symbol: string, value: number): AlertEvent[] {
    const prev = this.prevValues.get(`${symbol}:${metric}`) ?? value
    this.prevValues.set(`${symbol}:${metric}`, value)
    const now = Date.now()
    const events: AlertEvent[] = []
    for (const rule of rules) {
      if (!rule.enabled || rule.symbol !== symbol || rule.metric !== metric) continue
      if (rule.lastTriggered && now - rule.lastTriggered < rule.cooldownMs) continue
      const t = rule.threshold
      const fired =
        rule.condition === 'gt'        ? value > t :
        rule.condition === 'lt'        ? value < t :
        rule.condition === 'gte'       ? value >= t :
        rule.condition === 'lte'       ? value <= t :
        rule.condition === 'cross_up'  ? prev < t && value >= t :
        rule.condition === 'cross_down'? prev > t && value <= t : false
      if (fired) {
        // FIX: сначала push event, потом мутируем lastTriggered
        // чтобы повторный вход в evaluate() в том же тике не видел обновлённый cooldown
        events.push({ ruleId:rule.id, symbol, metric, value, ts:now })
        rule.lastTriggered = now
      }
    }
    return events
  }
}
