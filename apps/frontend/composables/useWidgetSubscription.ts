// apps/frontend/composables/useWidgetSubscription.ts
import { onUnmounted, watch, type Ref } from 'vue'

export function useWidgetSubscription(
  _widgetId: string,
  channels: string[],
  symbol: Ref<string>,
  onData: (channel: string, data: unknown) => void
) {
  const { subscribe, unsubscribe, onReady } = useWsClient()
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

  // onReady fires once WS is open (immediately if already connected)
  cancelReady = onReady(mount)

  // Resubscribe on symbol change (WS is already open at this point)
  watch(symbol, () => mount())

  onUnmounted(() => {
    unmount()
    cancelReady?.()
  })
}
