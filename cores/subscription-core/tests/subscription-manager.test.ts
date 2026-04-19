// cores/subscription-core/tests/subscription-manager.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createLogger } from '@crypto-platform/logger'
import { SubscriptionManager } from '../src/subscription-manager.js'

const log = createLogger('test')

describe('SubscriptionManager', () => {
  it('first viewer triggers START_STREAM', () => {
    const mgr = new SubscriptionManager(log, 100)
    const start = vi.fn()
    mgr.on('start_stream', start)
    mgr.subscribe('v1', 'BTC/USDT', [])
    expect(start).toHaveBeenCalledWith('BTC/USDT', [])
  })
  it('second viewer does NOT trigger START_STREAM again', () => {
    const mgr = new SubscriptionManager(log, 100)
    const start = vi.fn()
    mgr.on('start_stream', start)
    mgr.subscribe('v1', 'BTC/USDT', [])
    mgr.subscribe('v2', 'BTC/USDT', [])
    expect(start).toHaveBeenCalledTimes(1)
  })
  it('refCount=0 triggers STOP_STREAM after idle timeout', async () => {
    const mgr = new SubscriptionManager(log, 50)
    const stop = vi.fn()
    mgr.on('stop_stream', stop)
    mgr.subscribe('v1', 'BTC/USDT', [])
    mgr.unsubscribe('v1', 'BTC/USDT')
    await new Promise(r => setTimeout(r, 100))
    expect(stop).toHaveBeenCalled()
  })
  it('new viewer before timeout resets idle timer', async () => {
    const mgr = new SubscriptionManager(log, 100)
    const stop = vi.fn()
    mgr.on('stop_stream', stop)
    mgr.subscribe('v1', 'BTC/USDT', [])
    mgr.unsubscribe('v1', 'BTC/USDT')
    await new Promise(r => setTimeout(r, 50))
    mgr.subscribe('v2', 'BTC/USDT', [])
    await new Promise(r => setTimeout(r, 80))
    expect(stop).not.toHaveBeenCalled()
  })
})
