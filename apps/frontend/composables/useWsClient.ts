// apps/frontend/composables/useWsClient.ts
import { ref } from 'vue'

// Broadcast channels ws-gateway delivers to ALL clients automatically.
// No subscribe message needed; skip them in pendingSubs reconnect loop.
const BROADCAST_CHANNELS = new Set([
  'system_status',
  'screener_update',
  'options_update',
  'etf_latest',
])

// ── Singleton state (module-level, создаётся один раз) ──
const connected = ref(false)
const clientId  = ref<string | null>(null)
let   ws: WebSocket | null = null
let   reconnectTimer: ReturnType<typeof setTimeout> | null = null

const handlers   = new Map<string, Set<(data: unknown) => void>>()
// FIX #8: Map<channel, Set<symbol>> — поддержка нескольких символов на один канал
const pendingSubs = new Map<string, Set<string>>() // channel → Set of symbols

let initialized = false

function connect() {
  const { public: { wsUrl } } = useRuntimeConfig()

  if (ws && ws.readyState < 2) return
  ws = new WebSocket(wsUrl as string)

  ws.onopen = () => {
    connected.value = true
    // Restore symbol-specific subscriptions after reconnect.
    // Broadcast channels are delivered automatically — skip them.
    for (const [channel, symbols] of pendingSubs) {
      if (BROADCAST_CHANNELS.has(channel)) continue
      for (const symbol of symbols) {
        ws!.send(JSON.stringify({ type: 'subscribe', channels: [channel], symbol }))
      }
    }
  }

  ws.onclose = () => {
    connected.value = false
    ws = null
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 3000)
  }

  ws.onerror = () => ws?.close()

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'welcome') { clientId.value = msg.clientId; return }
      // FIX #1: msg.channel → msg.type
      // ws-gateway sends { type: 'ticker', data: {...} }, no 'channel' field
      const cbs = handlers.get(msg.type)
      if (cbs) for (const cb of cbs) cb(msg.data)
    } catch { /* ignore */ }
  }
}

export function useWsClient() {
  // инициализируем один раз при первом вызове (client-side only)
  if (!initialized && import.meta.client) {
    initialized = true
    connect()
  }

  function subscribe(channel: string, symbol: string, cb: (d: unknown) => void) {
    if (!handlers.has(channel)) handlers.set(channel, new Set())
    const set = handlers.get(channel)!

    // Guard: do not add the same callback reference twice.
    // This prevents duplicate updates when watch(immediate:true) fires
    // on an already-open socket (connected=true at mount time).
    if (set.has(cb)) return
    set.add(cb)

    // FIX #8: сохраняем все символы, а не только последний
    if (!pendingSubs.has(channel)) pendingSubs.set(channel, new Set())
    pendingSubs.get(channel)!.add(symbol)

    if (ws?.readyState === WebSocket.OPEN) {
      // Broadcast channels need no subscribe message — gateway pushes them
      // to all clients regardless. Only send for symbol-specific channels.
      if (!BROADCAST_CHANNELS.has(channel)) {
        ws.send(JSON.stringify({ type: 'subscribe', channels: [channel], symbol }))
      }
    }
  }

  function unsubscribe(channel: string, symbol: string, cb: (d: unknown) => void) {
    const set = handlers.get(channel)
    if (!set) return
    set.delete(cb)

    // отписываемся от сервера только если больше нет слушателей
    if (set.size === 0) {
      handlers.delete(channel)
      pendingSubs.delete(channel)
      if (ws?.readyState === WebSocket.OPEN && !BROADCAST_CHANNELS.has(channel)) {
        ws.send(JSON.stringify({ type: 'unsubscribe', channels: [channel], symbol }))
      }
    } else {
      // FIX #8: удаляем только этот символ
      pendingSubs.get(channel)?.delete(symbol)
    }
  }

  return { connected, clientId, subscribe, unsubscribe }
}

// HMR: закрываем старый сокет при hot reload
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    ws?.close()
    ws = null
    initialized = false
    handlers.clear()
    pendingSubs.clear()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  })
}
