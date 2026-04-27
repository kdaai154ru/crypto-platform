// apps/frontend/composables/useWidgetSubscription.ts
import { onUnmounted, watch, type Ref } from 'vue'

// FIX: импортируем BROADCAST_CHANNELS чтобы выбирать стратегию подписки.
// Broadcast-каналы (etf_latest, options_update и т.д.) не требуют server subscribe
// и должны ремаунтиться при каждом reconnect через onEveryReady.
// Symbol-каналы используют onReady (one-shot) + watch(symbol).
const BROADCAST_CHANNELS = new Set([
  'system_status',
  'screener_update',
  'options_update',
  'etf_latest',
  'alerts_triggered',
])

export function useWidgetSubscription(
  _widgetId: string,
  channels: string[],
  symbol: Ref<string>,
  onData: (channel: string, data: unknown) => void
) {
  const { subscribe, unsubscribe, onReady, onEveryReady } = useWsClient()
  const unsubs: Array<() => void> = []
  let cancelReady: (() => void) | null = null

  function mount() {
    unmount()
    const sym = symbol.value
    for (const ch of channels) {
      const cb = (d: unknown) => onData(ch, d)
      subscribe(ch, sym, cb)
      unsubs.push(() => unsubscribe(ch, sym, cb))
    }
  }

  function unmount() {
    unsubs.forEach(u => u())
    unsubs.length = 0
  }

  // FIX: если все каналы broadcast — используем onEveryReady чтобы remount
  // происходил при каждом reconnect. Иначе после обрыва WS данные не приходят.
  const isBroadcastOnly = channels.every(ch => BROADCAST_CHANNELS.has(ch))
  if (isBroadcastOnly) {
    cancelReady = onEveryReady(mount)
  } else {
    cancelReady = onReady(mount)
    // Resubscribe on symbol change (WS already open)
    watch(symbol, () => mount())
  }

  onUnmounted(() => {
    unmount()
    cancelReady?.()
  })
}
