// apps/ws-gateway/src/connection-manager.ts
import type { WebSocket } from 'uWebSockets.js'

/**
 * uWS WebSocket.send() возвращает number:
 *   0 = BACKPRESSURE (буфер переполнен — соединение живо, но перегружено)
 *   1 = SUCCESS
 *   2 = DROPPED   (соединение закрыто)
 */
export const UWS_SEND_BACKPRESSURE = 0
export const UWS_SEND_DROPPED      = 2

export interface WsClient {
  id: string
  subscriptions: Set<string>
  lastPing: number
  ws: WebSocket<unknown>
}

export class ConnectionManager {
  private clients = new Map<string, WsClient>()

  add(id: string, ws: WebSocket<unknown>): WsClient {
    const c: WsClient = { id, subscriptions: new Set(), lastPing: Date.now(), ws }
    this.clients.set(id, c)
    return c
  }

  remove(id: string): void { this.clients.delete(id) }
  get(id: string): WsClient | undefined { return this.clients.get(id) }
  all(): WsClient[] { return [...this.clients.values()] }
  count(): number { return this.clients.size }

  addSubscription(id: string, channel: string): void {
    this.clients.get(id)?.subscriptions.add(channel)
  }

  removeSubscription(id: string, channel: string): void {
    this.clients.get(id)?.subscriptions.delete(channel)
  }

  getByChannel(channel: string): WsClient[] {
    return this.all().filter(c => c.subscriptions.has(channel))
  }
}
