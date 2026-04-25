// apps/ws-gateway/src/connection-manager.ts
import type { WebSocket } from 'uWebSockets.js'

export const UWS_SEND_BACKPRESSURE = 0
export const UWS_SEND_DROPPED = 2
export const MAX_SUBSCRIPTIONS_PER_CLIENT = 50
// FIX #13: debounce threshold for updatePing — avoid Map.set() on every message
const PING_DEBOUNCE_MS = 1000

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
   * FIX #13: debounced updatePing — skips Map.set() if called within PING_DEBOUNCE_MS.
   * Prevents 100k+ Map writes/sec at high message throughput (1000 clients × 100 msg/s).
   */
  updatePing(id: string): void {
    const client = this.clients.get(id)
    if (client && Date.now() - client.lastPing > PING_DEBOUNCE_MS) {
      client.lastPing = Date.now()
    }
  }

  getStale(maxAgeMs: number): WsClient[] {
    const threshold = Date.now() - maxAgeMs
    return this.all().filter(c => c.lastPing < threshold)
  }

  subscriptionCount(id: string): number {
    return this.clients.get(id)?.subscriptions.size ?? 0
  }
}
