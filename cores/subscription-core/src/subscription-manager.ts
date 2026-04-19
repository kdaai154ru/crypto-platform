// cores/subscription-core/src/subscription-manager.ts
import { EventEmitter } from 'events'
import type { Logger } from '@crypto-platform/logger'

export type PairStatus = 'active'|'idle'|'stopped'

export interface PairState {
  symbol:   string
  refCount: number
  viewers:  Set<string>
  channels: string[]
  status:   PairStatus
  idleTimer?: ReturnType<typeof setTimeout>
  startedAt?: number
}

export class SubscriptionManager extends EventEmitter {
  private pairs = new Map<string, PairState>()
  private alwaysOn = new Set<string>()

  constructor(
    private readonly log: Logger,
    private readonly idleTimeoutMs = 60_000
  ) { super() }

  setAlwaysOn(symbols: string[]): void {
    this.alwaysOn = new Set(symbols)
    for (const s of symbols) this.subscribe('__always_on__', s, [])
  }

  subscribe(viewerId: string, symbol: string, channels: string[]): void {
    let state = this.pairs.get(symbol)
    if (!state) {
      state = { symbol, refCount: 0, viewers: new Set(), channels: [], status: 'stopped' }
      this.pairs.set(symbol, state)
    }
    // Обновляем список каналов если передан
    if (channels.length > 0) {
      state.channels = [...new Set([...state.channels, ...channels])]
    }
    if (!state.viewers.has(viewerId)) {
      state.viewers.add(viewerId)
      state.refCount++
    }
    if (state.idleTimer) { clearTimeout(state.idleTimer); state.idleTimer = undefined }
    if (state.status === 'stopped' || state.status === 'idle') {
      state.status = 'active'; state.startedAt = Date.now()
      this.log.info({ symbol, refCount: state.refCount }, 'START_STREAM')
      this.emit('start_stream', symbol, state.channels)
    } else {
      this.log.debug({ symbol, refCount: state.refCount }, 'fanout only')
    }
  }

  unsubscribe(viewerId: string, symbol: string): void {
    const state = this.pairs.get(symbol)
    if (!state || !state.viewers.has(viewerId)) return
    state.viewers.delete(viewerId)
    state.refCount = Math.max(0, state.refCount - 1)
    this.log.debug({ symbol, refCount: state.refCount }, 'unsubscribed')
    if (state.refCount === 0 && !this.alwaysOn.has(symbol)) {
      state.status = 'idle'
      state.idleTimer = setTimeout(() => {
        if (state.refCount === 0) {
          state.status = 'stopped'
          this.log.info({ symbol }, 'STOP_STREAM idle timeout')
          this.emit('stop_stream', symbol)
          this.pairs.delete(symbol)
        }
      }, this.idleTimeoutMs)
    }
  }

  getState(symbol: string): PairState|undefined { return this.pairs.get(symbol) }
  getActivePairCount(): number { return [...this.pairs.values()].filter(s=>s.status==='active').length }

  /**
   * Возвращает все активные пары с их каналами —
   * используется для replay stream:start после рестарта exchange-core.
   */
  getActivePairs(): Array<{ symbol: string; channels: string[] }> {
    return [...this.pairs.values()]
      .filter(s => s.status === 'active')
      .map(s => ({ symbol: s.symbol, channels: s.channels }))
  }
}
