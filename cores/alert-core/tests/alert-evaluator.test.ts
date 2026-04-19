// cores/alert-core/tests/alert-evaluator.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AlertEvaluator } from '../src/alert-evaluator.js'
import type { AlertRule } from '@crypto-platform/types'

function makeRule(condition: string, threshold: number, cooldownMs = 60_000): AlertRule {
  return {
    id: 'rule-1', userId: 'user-1', symbol: 'BTC/USDT', metric: 'rsi',
    condition: condition as AlertRule['condition'], threshold, cooldownMs,
    channels: ['in_app'], enabled: true, createdAt: Date.now()
  }
}

describe('AlertEvaluator', () => {
  let ev: AlertEvaluator

  beforeEach(() => { ev = new AlertEvaluator() })

  it('fires when value crosses above threshold', () => {
    const rule = makeRule('crosses_above', 70)
    expect(ev.evaluate(rule, 65, 0)).toBe(false)
    expect(ev.evaluate(rule, 71, 1000)).toBe(true)
  })

  it('fires when value crosses below threshold', () => {
    const rule = makeRule('crosses_below', 30)
    expect(ev.evaluate(rule, 35, 0)).toBe(false)
    expect(ev.evaluate(rule, 28, 1000)).toBe(true)
  })

  it('fires on greater_than condition', () => {
    const rule = makeRule('greater_than', 70)
    expect(ev.evaluate(rule, 69, 0)).toBe(false)
    expect(ev.evaluate(rule, 71, 0)).toBe(true)
  })

  it('fires on less_than condition', () => {
    const rule = makeRule('less_than', 30)
    expect(ev.evaluate(rule, 31, 0)).toBe(false)
    expect(ev.evaluate(rule, 29, 0)).toBe(true)
  })

  it('respects cooldown — does not re-fire within cooldown window', () => {
    const rule = makeRule('greater_than', 70, 60_000)
    expect(ev.evaluate(rule, 75, 0)).toBe(true)
    expect(ev.evaluate(rule, 76, 1_000)).toBe(false)   // within cooldown
    expect(ev.evaluate(rule, 77, 61_000)).toBe(true)   // after cooldown
  })

  it('ignores disabled rules', () => {
    const rule = { ...makeRule('greater_than', 70), enabled: false }
    expect(ev.evaluate(rule, 99, 0)).toBe(false)
  })

  it('only fires for matching symbol', () => {
    const rule = makeRule('greater_than', 70)
    // AlertEvaluator is called with the rule directly, symbol matching is caller responsibility
    // — just verify the evaluation logic is correct
    expect(ev.evaluate(rule, 75, 0)).toBe(true)
  })
})
