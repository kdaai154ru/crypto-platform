// cores/storage-core/tests/valkey-keys.test.ts
import { describe, it, expect } from 'vitest'
import { ValkeyKeys } from '../src/valkey-keys.js'

describe('ValkeyKeys', () => {
  it('generates correct ticker key', () => {
    expect(ValkeyKeys.ticker('BTC/USDT', 'binance')).toBe('ticker:BTC/USDT:binance')
  })

  it('generates correct candle key', () => {
    expect(ValkeyKeys.candle('ETH/USDT', 'binance', '1h')).toBe('candle:ETH/USDT:binance:1h')
  })

  it('generates correct OI key', () => {
    expect(ValkeyKeys.oi('BTC/USDT', 'binance')).toBe('oi:BTC/USDT:binance')
  })

  it('generates correct funding key', () => {
    expect(ValkeyKeys.funding('BTC/USDT', 'binance')).toBe('funding:BTC/USDT:binance')
  })

  it('generates correct screener key', () => {
    expect(ValkeyKeys.screener('rsi', '1h')).toBe('screener:rsi:1h')
  })

  it('generates correct heartbeat key', () => {
    expect(ValkeyKeys.heartbeat('exchange-core')).toBe('heartbeat:exchange-core')
  })

  it('generates correct system status key', () => {
    expect(ValkeyKeys.systemStatus()).toBe('system:status:modules')
  })
})
