// apps/frontend/composables/useWsClient.ts
import { ref } from 'vue'

// ── Singleton state (module-level, создаётся один раз) ──
const connected = ref(false)
const clientId  = ref<string | null>(null)
let   ws: WebSocket | null = null
let   reconnectTimer: ReturnType<typeof setTimeout> | null = null

const handlers   = new Map<string, Set<(data: unknown) => void>>()
const pendingSubs = new Map<string, { symbol: string }>()   // channel → last symbol

let initialized = false

function connect() {
  const { public: { wsUrl } } = useRuntimeConfig()

  if (ws && ws.readyState < 2) return
  ws = new WebSocket(wsUrl as string)

  ws.onopen = () => {
    connected.value = true
    // восстановить все подписки после реконнекта
    for (const [channel, { symbol }] of pendingSubs) {
      ws!.send(JSON.stringify({ type: 'subscribe', channels: [channel], symbol }))
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
      const cbs = handlers.get(msg.channel)
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
    handlers.get(channel)!.add(cb)
    pendingSubs.set(channel, { symbol })

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', channels: [channel], symbol }))
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
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', channels: [channel], symbol }))
      }
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