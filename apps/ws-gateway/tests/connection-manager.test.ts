// apps/ws-gateway/tests/connection-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ConnectionManager } from '../src/connection-manager.js'

describe('ConnectionManager', () => {
  let cm: ConnectionManager

  beforeEach(() => { cm = new ConnectionManager() })

  it('adds a client and returns it', () => {
    const c = cm.add('id-1', {})
    expect(c.id).toBe('id-1')
    expect(cm.count()).toBe(1)
  })

  it('removes a client', () => {
    cm.add('id-1', {})
    cm.remove('id-1')
    expect(cm.count()).toBe(0)
    expect(cm.get('id-1')).toBeUndefined()
  })

  it('returns undefined for missing client', () => {
    expect(cm.get('nope')).toBeUndefined()
  })

  it('adds/removes subscriptions', () => {
    cm.add('id-1', {})
    cm.addSubscription('id-1', 'ticker:BTC/USDT')
    cm.addSubscription('id-1', 'trades:BTC/USDT')
    expect(cm.get('id-1')!.subscriptions.has('ticker:BTC/USDT')).toBe(true)
    cm.removeSubscription('id-1', 'ticker:BTC/USDT')
    expect(cm.get('id-1')!.subscriptions.has('ticker:BTC/USDT')).toBe(false)
  })

  it('finds clients by channel', () => {
    cm.add('id-1', {})
    cm.add('id-2', {})
    cm.addSubscription('id-1', 'ticker:BTC/USDT')
    cm.addSubscription('id-2', 'ticker:ETH/USDT')
    const res = cm.getByChannel('ticker:BTC/USDT')
    expect(res.length).toBe(1)
    expect(res[0]!.id).toBe('id-1')
  })

  it('returns all clients', () => {
    cm.add('a', {}); cm.add('b', {}); cm.add('c', {})
    expect(cm.all().length).toBe(3)
  })
})
