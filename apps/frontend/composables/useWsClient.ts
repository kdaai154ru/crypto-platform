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

const handlers    = new Map<string, Set<(data: unknown) => void>>()
const pendingSubs = new Map<string, Set<string>>() // channel → Set of symbols

let initialized = false
// FIX: wsUrl кэшируется после первого вызова useWsClient() внутри Nuxt-контекста
let cachedWsUrl: string | null = null

function connect() {
  // cachedWsUrl гарантированно установлен до вызова connect()
  const url = cachedWsUrl!

  if (ws && ws.readyState < 2) return
  ws = new WebSocket(url)

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
      const cbs = handlers.get(msg.type)
      if (cbs) for (const cb of cbs) cb(msg.data)
    } catch { /* ignore */ }
  }
}

export function useWsClient() {
  if (!initialized && import.meta.client) {
    initialized = true
    // FIX: useRuntimeConfig() вызывается здесь — внутри Nuxt composable контекста,
    // а не на уровне модуля где Nuxt-контекст ещё не доступен.
    const { public: pub } = useRuntimeConfig()
    cachedWsUrl = (pub.wsUrl as string) ?? 'ws://localhost:4000'
    connect()
  }

  function subscribe(channel: string, symbol: string, cb: (d: unknown) => void) {
    if (!handlers.has(channel)) handlers.set(channel, new Set())
    const set = handlers.get(channel)!

    // Guard: do not add the same callback reference twice.
    if (set.has(cb)) return
    set.add(cb)

    if (!pendingSubs.has(channel)) pendingSubs.set(channel, new Set())
    pendingSubs.get(channel)!.add(symbol)

    if (ws?.readyState === WebSocket.OPEN) {
      if (!BROADCAST_CHANNELS.has(channel)) {
        ws.send(JSON.stringify({ type: 'subscribe', channels: [channel], symbol }))
      }
    }
  }

  function unsubscribe(channel: string, symbol: string, cb: (d: unknown) => void) {
    const set = handlers.get(channel)
    if (!set) return
    set.delete(cb)

    if (set.size === 0) {
      handlers.delete(channel)
      pendingSubs.delete(channel)
      if (ws?.readyState === WebSocket.OPEN && !BROADCAST_CHANNELS.has(channel)) {
        ws.send(JSON.stringify({ type: 'unsubscribe', channels: [channel], symbol }))
      }
    } else {
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
    cachedWsUrl = null
    handlers.clear()
    pendingSubs.clear()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  })
}
