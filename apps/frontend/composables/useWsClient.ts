// apps/frontend/composables/useWsClient.ts
import { ref, watch } from 'vue'

// Must stay in sync with BROADCAST_WS_CHANNELS in apps/ws-gateway/src/valkey-streams.ts.
const BROADCAST_CHANNELS = new Set([
  'system_status',
  'screener_update',
  'options_update',
  'etf_latest',
  'alerts_triggered',
])

// ── Singleton state ──
const connected = ref(false)
const clientId  = ref<string | null>(null)
let   ws: WebSocket | null = null
let   reconnectTimer: ReturnType<typeof setTimeout> | null = null

const handlers    = new Map<string, Set<(data: unknown) => void>>()
const pendingSubs = new Map<string, Set<string>>()

// FIX: разделяем one-shot очередь (readyQueue) и постоянные коллбэки (persistentReady).
// readyQueue — вызываются один раз при первом connect, затем очищаются.
// persistentReady — вызываются при КАЖДОМ reconnect (нужно для broadcast-каналов
// которые не восстанавливаются через pendingSubs т.к. не шлют subscribe на сервер).
const readyQueue     = new Set<() => void>()
const persistentReady = new Set<() => void>()

let initialized = false
let connecting  = false
let cachedWsUrl: string | null = null

function flushReadyQueue() {
  // One-shot callbacks
  for (const cb of readyQueue) {
    try { cb() } catch {/* ignore */}
  }
  readyQueue.clear()
  // Persistent callbacks (broadcast re-mount on every reconnect)
  for (const cb of persistentReady) {
    try { cb() } catch {/* ignore */}
  }
}

function connect() {
  if (connecting || (ws && ws.readyState < 2)) return
  connecting = true

  const url = cachedWsUrl!
  ws = new WebSocket(url)

  ws.onopen = () => {
    connecting = false
    connected.value = true
    // Restore symbol-specific subscriptions after reconnect
    for (const [channel, symbols] of pendingSubs) {
      for (const symbol of symbols) {
        ws!.send(JSON.stringify({ type: 'subscribe', channels: [channel], symbol }))
      }
    }
    // Fire ready callbacks
    flushReadyQueue()
  }

  ws.onclose = () => {
    connecting = false
    connected.value = false
    ws = null
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 3000)
  }

  ws.onerror = () => { ws?.close() }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string) as { type: string; clientId?: string; data?: unknown }
      if (msg.type === 'welcome') { clientId.value = msg.clientId ?? null; return }
      const cbs = handlers.get(msg.type)
      if (cbs) for (const cb of cbs) cb(msg.data)
    } catch { /* ignore */ }
  }
}

export function useWsClient() {
  if (!initialized && import.meta.client) {
    initialized = true
    const { public: pub } = useRuntimeConfig()
    cachedWsUrl = (pub.wsUrl as string) ?? 'ws://localhost:4000'
    connect()
  }

  /**
   * Register a one-shot callback — runs once when WS is open.
   * Returns an unregister function.
   */
  function onReady(cb: () => void): () => void {
    if (!import.meta.client) return () => {}
    if (connected.value) {
      Promise.resolve().then(cb)
    } else {
      readyQueue.add(cb)
    }
    return () => readyQueue.delete(cb)
  }

  /**
   * FIX: Register a persistent callback — runs on EVERY (re)connect.
   * Used by broadcast-channel widgets so they re-mount subscriptions
   * after WS reconnects without needing an explicit server subscribe.
   * Returns an unregister function.
   */
  function onEveryReady(cb: () => void): () => void {
    if (!import.meta.client) return () => {}
    if (connected.value) {
      Promise.resolve().then(cb)
    }
    persistentReady.add(cb)
    return () => persistentReady.delete(cb)
  }

  function subscribe(channel: string, symbol: string, cb: (d: unknown) => void) {
    if (!handlers.has(channel)) handlers.set(channel, new Set())
    const set = handlers.get(channel)!
    if (set.has(cb)) return
    set.add(cb)

    if (!BROADCAST_CHANNELS.has(channel)) {
      if (!pendingSubs.has(channel)) pendingSubs.set(channel, new Set())
      pendingSubs.get(channel)!.add(symbol)
      if (ws?.readyState === WebSocket.OPEN) {
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
      if (!BROADCAST_CHANNELS.has(channel)) {
        pendingSubs.delete(channel)
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'unsubscribe', channels: [channel], symbol }))
        }
      }
    } else if (!BROADCAST_CHANNELS.has(channel)) {
      pendingSubs.get(channel)?.delete(symbol)
    }
  }

  return { connected, clientId, subscribe, unsubscribe, onReady, onEveryReady }
}

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    ws?.close()
    ws = null
    initialized = false
    connecting  = false
    cachedWsUrl = null
    handlers.clear()
    pendingSubs.clear()
    readyQueue.clear()
    persistentReady.clear()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  })
}
