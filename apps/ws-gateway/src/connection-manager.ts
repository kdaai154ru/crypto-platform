// apps/ws-gateway/src/connection-manager.ts
import type { WebSocket } from 'uWebSockets.js'

export const UWS_SEND_BACKPRESSURE = 0
export const UWS_SEND_DROPPED = 2
export const MAX_SUBSCRIPTIONS_PER_CLIENT = 50

export interface WsClient {
  id: string
  subscriptions: Set<string>
  lastPing: number
  ws: WebSocket<unknown>
}

export class ConnectionManager {
  private clients = new Map<string, WsClient>()

  add(id: string, ws: WebSocket<unknown>): WsClient {
    const c: WsClient = {
      id,
      subscriptions: new Set(),
      lastPing: Date.now(),
      ws
    }
    this.clients.set(id, c)
    return c
  }

  remove(id: string): void {
    this.clients.delete(id)
  }

  get(id: string): WsClient | undefined {
    return this.clients.get(id)
  }

  all(): WsClient[] {
    return [...this.clients.values()]
  }

  count(): number {
    return this.clients.size
  }

  /**
   * Добавляет подписку клиенту.
   * @returns true если подписка добавлена, false если превышен лимит
   */
  addSubscription(id: string, channel: string): boolean {
    const client = this.clients.get(id)
    if (!client) return false
    if (client.subscriptions.size >= MAX_SUBSCRIPTIONS_PER_CLIENT) {
      return false
    }
    client.subscriptions.add(channel)
    return true
  }

  removeSubscription(id: string, channel: string): void {
    this.clients.get(id)?.subscriptions.delete(channel)
  }

  getByChannel(channel: string): WsClient[] {
    return this.all().filter(c => c.subscriptions.has(channel))
  }

  /**
   * Обновляет время последнего ping для клиента.
   */
  updatePing(id: string): void {
    const client = this.clients.get(id)
    if (client) {
      client.lastPing = Date.now()
    }
  }

  /**
   * Возвращает клиентов, у которых lastPing старше maxAgeMs.
   */
  getStale(maxAgeMs: number): WsClient[] {
    const threshold = Date.now() - maxAgeMs
    return this.all().filter(c => c.lastPing < threshold)
  }

  /**
   * Возвращает количество подписок клиента.
   */
  subscriptionCount(id: string): number {
    return this.clients.get(id)?.subscriptions.size ?? 0
  }
}