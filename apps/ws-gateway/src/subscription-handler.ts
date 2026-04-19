// apps/ws-gateway/src/subscription-handler.ts
import type { ConnectionManager } from './connection-manager.js'
import type Valkey from 'iovalkey'
import type { Logger } from '@crypto-platform/logger'

/**
 * Каналы без символа (системные): сообщения для них не отправляются
 * в subscription-core, они работают через отдельные процессы.
 */
const SYSTEM_CHANNELS = new Set([
  'trades:large', 'liquidations', 'whale:feed',
  'screener:update', 'options:update', 'etf:latest', 'system:status',
])

/**
 * Извлекает symbol из канала.
 * Примеры:
 *   ticker:BTC/USDT            → BTC/USDT
 *   ohlcv:BTC/USDT:1m          → BTC/USDT
 *   trades:BTC/USDT            → BTC/USDT
 *   trades:delta:BTC/USDT      → BTC/USDT
 *   trades:large               → null  (системный)
 *   screener:update            → null  (системный)
 */
function extractSymbol(channel: string): string | null {
  if (SYSTEM_CHANNELS.has(channel)) return null
  // Формат trades:delta:BTC/USDT — символ в позиции [2]
  if (channel.startsWith('trades:delta:')) return channel.split(':').slice(2).join(':')
  // Общий случай: префикс:SYMBOL или префикс:SYMBOL:TF
  const parts = channel.split(':')
  // BTC/USDT содержит '/', постепенно собираем части с индекса 1 до последней части timeframe
  // ticker:BTC/USDT → parts[1]='BTC/USDT' ✔
  // ohlcv:BTC/USDT:1m → parts[1]='BTC/USDT', parts[2]='1m' — символ parts[1] ✔
  const sym = parts[1]
  return sym && sym.includes('/') ? sym : null
}

export class SubscriptionHandler {
  constructor(
    private readonly cm: ConnectionManager,
    private readonly valkey: Valkey,
    private readonly log: Logger
  ) {}

  subscribe(clientId: string, channels: string[], symbol?: string): void {
    for (const ch of channels) {
      this.cm.addSubscription(clientId, ch)
    }
    // Отправляем один sub:request на весь список каналов сразу,
    // а не по одному сообщению на каждый канал.
    if (symbol) {
      this.valkey.publish('sub:request', JSON.stringify({ viewerId: clientId, symbol, channels }))
    }
    this.log.debug({ clientId, channels, symbol }, 'subscribed')
  }

  unsubscribe(clientId: string, channels: string[], symbol?: string): void {
    for (const ch of channels) {
      this.cm.removeSubscription(clientId, ch)
    }
    if (symbol) {
      this.valkey.publish('sub:release', JSON.stringify({ viewerId: clientId, symbol }))
    }
    this.log.debug({ clientId, channels, symbol }, 'unsubscribed')
  }

  unsubscribeAll(clientId: string): void {
    const c = this.cm.get(clientId)
    if (!c) return

    const symbols = new Set<string>()
    for (const ch of c.subscriptions) {
      // Используем фикс: извлекаем symbol через унифицированную функцию,
      // которая не смешивает системные каналы (с неправильным symbol)
      const sym = extractSymbol(ch)
      if (sym) symbols.add(sym)
    }
    for (const sym of symbols) {
      this.valkey.publish('sub:release', JSON.stringify({ viewerId: clientId, symbol: sym }))
    }
    c.subscriptions.clear()
    this.log.debug({ clientId, releasedSymbols: [...symbols] }, 'unsubscribeAll')
  }
}
