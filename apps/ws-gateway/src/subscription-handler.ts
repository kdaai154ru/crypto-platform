// apps/ws-gateway/src/subscription-handler.ts
import type { ConnectionManager } from './connection-manager.js'
import type Valkey from 'iovalkey'
import type { Logger } from '@crypto-platform/logger'

export class SubscriptionHandler {
  constructor(
    private readonly cm: ConnectionManager,
    private readonly valkey: Valkey,
    private readonly log: Logger
  ) {}

  subscribe(clientId:string, channels:string[], symbol?:string): void {
    for (const ch of channels) {
      this.cm.addSubscription(clientId, ch)
      if (symbol) {
        this.valkey.publish('sub:request', JSON.stringify({ viewerId:clientId, symbol, channels }))
      }
    }
    this.log.debug({ clientId, channels }, 'subscribed')
  }

  unsubscribe(clientId:string, channels:string[], symbol?:string): void {
    for (const ch of channels) {
      this.cm.removeSubscription(clientId, ch)
    }
    if (symbol) {
      this.valkey.publish('sub:release', JSON.stringify({ viewerId:clientId, symbol }))
    }
  }

  unsubscribeAll(clientId:string): void {
    const c = this.cm.get(clientId)
    if (!c) return
    const symbols = new Set<string>()
    for (const ch of c.subscriptions) {
      const sym = ch.split(':')[1]
      if (sym) symbols.add(sym)
    }
    for (const sym of symbols) {
      this.valkey.publish('sub:release', JSON.stringify({ viewerId:clientId, symbol:sym }))
    }
    c.subscriptions.clear()
  }
}
