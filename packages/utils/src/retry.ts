// packages/utils/src/retry.ts
import { sleep } from './math.js'

export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 5, baseDelay = 1000, maxDelay = 30_000 }: {
    maxAttempts?: number
    baseDelay?: number
    maxDelay?: number
  } = {}
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn() }
    catch (e) {
      lastErr = e
      if (i < maxAttempts - 1) {
        // FIX: добавлен jitter ±50% — предотвращает thundering herd при массовом reconnect
        const base = Math.min(baseDelay * 2 ** i, maxDelay)
        await sleep(base * (0.5 + Math.random() * 0.5))
      }
    }
  }
  throw lastErr
}
