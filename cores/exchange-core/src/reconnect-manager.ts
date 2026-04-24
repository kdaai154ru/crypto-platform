// cores/exchange-core/src/reconnect-manager.ts
import { sleep } from '@crypto-platform/utils'
import type { Logger } from '@crypto-platform/logger'

export class ReconnectManager {
  private attempt = 0
  private running = false
  // FIX: track a pending reconnect request that arrived while running=true
  // so it is not silently dropped.
  private pendingReconnect = false
  constructor(
    private readonly name: string,
    private readonly logger: Logger,
    private readonly maxDelay = 30_000
  ) {}
  async schedule(connect: () => Promise<void>): Promise<void> {
    if (this.running) {
      // FIX: instead of returning, remember that another reconnect is needed.
      this.pendingReconnect = true
      return
    }
    this.running = true
    do {
      this.pendingReconnect = false
      const delay = Math.min(1000 * 2 ** this.attempt, this.maxDelay)
      this.logger.warn({ name: this.name, attempt: this.attempt, delay }, 'reconnecting')
      await sleep(delay)
      this.attempt++
      try { await connect(); this.attempt = 0 }
      catch (e) { this.logger.error(e, 'reconnect failed') }
    } while (this.pendingReconnect)
    this.running = false
  }
  reset() { this.attempt = 0 }
}
