// apps/frontend/composables/useWidgetSubscription.ts
import { ref, onMounted, onUnmounted, watch, type Ref } from 'vue'

export function useWidgetSubscription(
  widgetId: string,
  channels: string[],
  symbol: Ref<string>,  // FIX: Ref<string> вместо string — позволяет watch следить за сменой
  onData: (channel: string, data: unknown) => void
) {
  const error   = ref<string | null>(null)
  const loading = ref(true)
  const { subscribe, unsubscribe, connected } = useWsClient()
  const unsubs: Array<() => void> = []

  function mount() {
    loading.value = true
    const sym = symbol.value
    for (const ch of channels) {
      const cb = (d: unknown) => { loading.value = false; onData(ch, d) }
      subscribe(ch, sym, cb)
      unsubs.push(() => unsubscribe(ch, sym, cb))
    }
  }

  function unmount() {
    unsubs.forEach(u => u())
    unsubs.length = 0
  }

  onMounted(() => { if (connected.value) mount() })

  // Переподписываемся при реконнекте
  watch(connected, (v) => {
    if (v) { unmount(); mount() } else unmount()
  })

  // FIX: отписываемся от старого символа и подписываемся на новый при смене символа
  watch(symbol, () => {
    if (connected.value) { unmount(); mount() }
  })

  onUnmounted(unmount)

  return { error, loading }
}
