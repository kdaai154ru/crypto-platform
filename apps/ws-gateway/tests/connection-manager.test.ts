// tests/connection-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ConnectionManager } from '../src/connection-manager.js'

describe('ConnectionManager', () => {
  let cm: ConnectionManager

  beforeEach(() => {
    cm = new ConnectionManager()
  })

  it('starts empty', () => {
    expect(cm.count()).toBe(0)
    expect(cm.all()).toHaveLength(0)
  })

  it('add and remove client', () => {
    const fakeWs = { ping: () => {}, close: () => {} } as any
    cm.add('client-1', fakeWs)
    expect(cm.count()).toBe(1)
    expect(cm.get('client-1')).toBeDefined()
    cm.remove('client-1')
    expect(cm.count()).toBe(0)
    expect(cm.get('client-1')).toBeUndefined()
  })

  it('addSubscription respects MAX_SUBSCRIPTIONS_PER_CLIENT limit', () => {
    const fakeWs = { ping: () => {}, close: () => {} } as any
    cm.add('client-1', fakeWs)
    for (let i = 0; i < 50; i++) {
      cm.addSubscription('client-1', `channel-${i}`)
    }
    // 51-я подписка не должна добавиться
    const added = cm.addSubscription('client-1', 'channel-overflow')
    expect(added).toBe(false)
    expect(cm.subscriptionCount('client-1')).toBe(50)
  })

  it('removeSubscription works', () => {
    const fakeWs = { ping: () => {}, close: () => {} } as any
    cm.add('client-1', fakeWs)
    cm.addSubscription('client-1', 'trades')
    cm.addSubscription('client-1', 'ticker')
    cm.removeSubscription('client-1', 'trades')
    expect(cm.subscriptionCount('client-1')).toBe(1)
  })
})
