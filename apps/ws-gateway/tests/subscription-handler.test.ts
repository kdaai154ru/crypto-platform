// apps/ws-gateway/tests/subscription-handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectionManager } from '../src/connection-manager.js'
import { SubscriptionHandler } from '../src/subscription-handler.js'
import { createLogger } from '@crypto-platform/logger'

const log = createLogger('test')

function makeValkeyMock() {
  return { publish: vi.fn().mockResolvedValue(1) }
}

describe('SubscriptionHandler', () => {
  let cm: ConnectionManager
  let handler: SubscriptionHandler
  let valkey: ReturnType<typeof makeValkeyMock>

  beforeEach(() => {
    cm = new ConnectionManager()
    valkey = makeValkeyMock()
    handler = new SubscriptionHandler(cm, valkey as any, log)
    cm.add('client-1', {})
  })

  it('adds channel to client subscriptions', () => {
    handler.subscribe('client-1', ['ticker:BTC/USDT'], 'BTC/USDT')
    expect(cm.get('client-1')!.subscriptions.has('ticker:BTC/USDT')).toBe(true)
  })

  it('publishes sub:request to valkey when subscribing with symbol', () => {
    handler.subscribe('client-1', ['ticker:BTC/USDT'], 'BTC/USDT')
    expect(valkey.publish).toHaveBeenCalledWith('sub:request', expect.stringContaining('BTC/USDT'))
  })

  it('removes channel on unsubscribe', () => {
    handler.subscribe('client-1', ['ticker:BTC/USDT'], 'BTC/USDT')
    handler.unsubscribe('client-1', ['ticker:BTC/USDT'], 'BTC/USDT')
    expect(cm.get('client-1')!.subscriptions.has('ticker:BTC/USDT')).toBe(false)
  })

  it('publishes sub:release on unsubscribe', () => {
    handler.subscribe('client-1', ['ticker:BTC/USDT'], 'BTC/USDT')
    handler.unsubscribe('client-1', ['ticker:BTC/USDT'], 'BTC/USDT')
    expect(valkey.publish).toHaveBeenCalledWith('sub:release', expect.stringContaining('BTC/USDT'))
  })

  it('clears all subscriptions and releases all symbols on unsubscribeAll', () => {
    handler.subscribe('client-1', ['ticker:BTC/USDT'], 'BTC/USDT')
    handler.subscribe('client-1', ['ticker:ETH/USDT'], 'ETH/USDT')
    handler.unsubscribeAll('client-1')
    expect(cm.get('client-1')!.subscriptions.size).toBe(0)
    expect(valkey.publish).toHaveBeenCalledWith('sub:release', expect.stringContaining('BTC/USDT'))
    expect(valkey.publish).toHaveBeenCalledWith('sub:release', expect.stringContaining('ETH/USDT'))
  })

  it('does not throw for unknown clientId on unsubscribeAll', () => {
    expect(() => handler.unsubscribeAll('ghost-client')).not.toThrow()
  })
})
