// packages/utils/tests/retry.test.ts
import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '../src/retry.js'

describe('withRetry', () => {
  it('resolves immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 10 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('retries on failure and succeeds', async () => {
    let calls = 0
    const fn = vi.fn().mockImplementation(() => {
      calls++
      if (calls < 3) return Promise.reject(new Error('fail'))
      return Promise.resolve('success')
    })
    const result = await withRetry(fn, { attempts: 5, baseDelayMs: 5 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 5 })).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('calls onRetry callback on each retry', async () => {
    const onRetry = vi.fn()
    let calls = 0
    const fn = vi.fn().mockImplementation(() => {
      calls++
      if (calls < 3) return Promise.reject(new Error('err'))
      return Promise.resolve('done')
    })
    await withRetry(fn, { attempts: 5, baseDelayMs: 5, onRetry })
    expect(onRetry).toHaveBeenCalledTimes(2)
  })
})
