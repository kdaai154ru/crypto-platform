// cores/alert-core/src/alert-evaluator.ts
import type { AlertRule } from './alert-rule.js'
import type { Logger } from '@crypto-platform/logger'
import type Valkey from 'iovalkey'

export interface AlertEvent { ruleId:string; symbol:string; metric:string; value:number; ts:number }

const PREV_VALUES_KEY = 'alert:prev_values';
// TTL 24 часа — чтобы stale значения не жили вечно
const PREV_VALUES_TTL = 86_400;

export class AlertEvaluator {
  // FIX #17: in-memory кэш + персистирование в Redis
  // при рестарте cross_up/cross_down корректно восстанавливаются
  private memCache = new Map<string, number>()

  constructor(
    private readonly log: Logger,
    private readonly db: Valkey
  ) {}

  // Вызывается один раз при старте — прогревает кэш из Redis
  async loadPrevValues(): Promise<void> {
    try {
      const hash = await this.db.hgetall(PREV_VALUES_KEY);
      if (!hash) return;
      for (const [k, v] of Object.entries(hash)) {
        const n = parseFloat(v);
        if (!isNaN(n)) this.memCache.set(k, n);
      }
      this.log.info({ count: this.memCache.size }, 'alert prevValues restored from Redis');
    } catch (e) {
      this.log.warn(e, 'failed to load prevValues from Redis');
    }
  }

  evaluate(rules: AlertRule[], metric: string, symbol: string, value: number): AlertEvent[] {
    const cacheKey = `${symbol}:${metric}`;
    const prev = this.memCache.get(cacheKey) ?? value
    this.memCache.set(cacheKey, value)
    // Персистируем асинхронно — не блокируем evaluate()
    this.db.hset(PREV_VALUES_KEY, cacheKey, String(value))
      .then(() => this.db.expire(PREV_VALUES_KEY, PREV_VALUES_TTL))
      .catch((e: unknown) => this.log.warn(e, 'failed to persist prevValue'))

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
        events.push({ ruleId:rule.id, symbol, metric, value, ts:now })
        rule.lastTriggered = now
      }
    }
    return events
  }
}
