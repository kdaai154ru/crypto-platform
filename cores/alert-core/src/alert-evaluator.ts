// cores/alert-core/src/alert-evaluator.ts
import type { AlertRule } from './alert-rule.js'
import type { Logger } from '@crypto-platform/logger'
import type Valkey from 'iovalkey'

export interface AlertEvent { ruleId:string; symbol:string; metric:string; value:number; ts:number }

const PREV_VALUES_KEY = 'alert:prev_values';
const PREV_VALUES_TTL = 86_400;

export class AlertEvaluator {
  private memCache = new Map<string, number>()

  // FIX: cooldown state lives here, NOT on rule objects.
  // Rule objects are replaced wholesale by loadRules() — mutating them
  // directly causes lost cooldown state and potential read-of-stale-object bugs.
  private readonly lastTriggered = new Map<string, number>()

  constructor(
    private readonly log: Logger,
    private readonly db: Valkey
  ) {}

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

  evaluate(rules: readonly AlertRule[], metric: string, symbol: string, value: number): AlertEvent[] {
    const cacheKey = `${symbol}:${metric}`;
    const prev: number = this.memCache.has(cacheKey)
      ? this.memCache.get(cacheKey)!
      : NaN

    this.memCache.set(cacheKey, value)
    this.db.hset(PREV_VALUES_KEY, cacheKey, String(value))
      .then(() => this.db.expire(PREV_VALUES_KEY, PREV_VALUES_TTL))
      .catch((e: unknown) => this.log.warn(e, 'failed to persist prevValue'))

    const now = Date.now()
    const events: AlertEvent[] = []

    for (const rule of rules) {
      if (!rule.enabled || rule.symbol !== symbol || rule.metric !== metric) continue

      // FIX: read cooldown from our own Map, not from rule.lastTriggered
      const lastTs = this.lastTriggered.get(rule.id) ?? 0
      if (now - lastTs < rule.cooldownMs) continue

      const t = rule.threshold
      const fired =
        rule.condition === 'gt'         ? value > t :
        rule.condition === 'lt'         ? value < t :
        rule.condition === 'gte'        ? value >= t :
        rule.condition === 'lte'        ? value <= t :
        rule.condition === 'cross_up'   ? !isNaN(prev) && prev < t && value >= t :
        rule.condition === 'cross_down' ? !isNaN(prev) && prev > t && value <= t : false

      if (fired) {
        events.push({ ruleId: rule.id, symbol, metric, value, ts: now })
        // FIX: write to our own Map — never mutate the rule object
        this.lastTriggered.set(rule.id, now)
      }
    }
    return events
  }

  // Called after loadRules() to prune stale entries from dead rules
  pruneLastTriggered(activeRuleIds: Set<string>): void {
    for (const id of this.lastTriggered.keys()) {
      if (!activeRuleIds.has(id)) this.lastTriggered.delete(id)
    }
  }
}
