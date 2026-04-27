// apps/frontend/composables/useWidgetSubscription.ts
import { ref, onUnmounted, watch, type Ref } from 'vue'

export function useWidgetSubscription(
  widgetId: string,
  channels: string[],
  symbol: Ref<string>,
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

  // FIX: заменяем onMounted + watch(connected) на watch(connected, { immediate: true }).
  //
  // Проблема прежней логики:
  //   onMounted(срабатывает после hydration) → к этому моменту WS уже connected=true 
  //   (сокет открыт до монтирования панелей) → mount() вызывается один раз.
  //   Но потом watch(connected) не срабатывает на переход false→true если переподключение
  //   произошло до mounted. С immediate:true watch вызывает callback сразу при 
  //   регистрации composable, затем реагирует на каждую смену connected.
  watch(connected, (v) => {
    if (v) { unmount(); mount() } else unmount()
  }, { immediate: true })

  // Переподписываемся при смене символа
  watch(symbol, () => {
    if (connected.value) { unmount(); mount() }
  })

  onUnmounted(unmount)

  return { error, loading }
}
