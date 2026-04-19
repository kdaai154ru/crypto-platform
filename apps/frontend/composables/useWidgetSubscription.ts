// apps/frontend/composables/useWidgetSubscription.ts
import { ref, onMounted, onUnmounted, watch } from 'vue'

export function useWidgetSubscription(
  widgetId: string,
  channels: string[],
  symbol: string,
  onData: (channel: string, data: unknown) => void
) {
  const error   = ref<string | null>(null)
  const loading = ref(true)
  const { subscribe, unsubscribe, connected } = useWsClient()
  const unsubs: Array<() => void> = []

  function mount() {
    for (const ch of channels) {
      const cb = (d: unknown) => { loading.value = false; onData(ch, d) }
      subscribe(ch, symbol, cb)
      unsubs.push(() => unsubscribe(ch, symbol, cb))
    }
  }

  function unmount() {
    unsubs.forEach(u => u())
    unsubs.length = 0
  }

  onMounted(() => { if (connected.value) mount() })
  watch(connected, (v) => { if (v) { unmount(); mount() } else unmount() })
  onUnmounted(unmount)

  return { error, loading }
}