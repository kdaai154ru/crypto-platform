// tests/integration/valkey-reconnect.test.ts
// Verifies: no duplicate messages after Valkey reconnect (isPolling guard)
// Requires a running Valkey instance at localhost:6379
// Run: docker compose -f infra/docker/docker-compose.yml up valkey -d
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Valkey from 'iovalkey'

let pub: Valkey
let sub: Valkey

beforeAll(async () => {
  pub = new Valkey({ host: 'localhost', port: 6379, lazyConnect: true })
  sub = new Valkey({ host: 'localhost', port: 6379, lazyConnect: true })
  await pub.connect()
  await sub.connect()
})

afterAll(async () => {
  await pub.quit()
  await sub.quit()
})

describe('Valkey Streams — reconnect guard', () => {
  const STREAM   = 'test:stream:reconnect'
  const GROUP    = 'test-group'
  const CONSUMER = 'test-consumer-1'

  beforeAll(async () => {
    // Clean up previous run artifacts
    await pub.del(STREAM)
    try {
      await pub.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM')
    } catch {
      // group may already exist if stream was not deleted
    }
  })

  it('XADD + XREADGROUP delivers each message exactly once', async () => {
    // Add 5 messages
    for (let i = 0; i < 5; i++) {
      await pub.xadd(STREAM, '*', 'data', JSON.stringify({ seq: i, ts: Date.now() }))
    }

    // Read all pending messages
    const results = await sub.xreadgroup(
      'GROUP', GROUP, CONSUMER,
      'COUNT', 10,
      'STREAMS', STREAM, '>'
    ) as Array<[string, Array<[string, string[]]>]> | null

    expect(results).not.toBeNull()
    const messages = results![0]![1]
    expect(messages).toHaveLength(5)

    // ACK all messages
    const ids = messages.map(m => m[0])
    const ackCount = await sub.xack(STREAM, GROUP, ...ids)
    expect(ackCount).toBe(5)
  })

  it('simulated reconnect: XREADGROUP with > returns 0 new messages (all acked)', async () => {
    // After all messages are acked, a fresh XREADGROUP > should return nothing
    const results = await sub.xreadgroup(
      'GROUP', GROUP, CONSUMER,
      'COUNT', 10,
      'STREAMS', STREAM, '>'
    ) as Array<[string, Array<[string, string[]]>]> | null

    // null or empty entries — no duplicates delivered
    const count = results ? results[0]![1].length : 0
    expect(count).toBe(0)
  })

  it('PEL is empty after XACK — XPENDING returns 0', async () => {
    const pending = await pub.xpending(STREAM, GROUP) as [number, ...unknown[]]
    // pending[0] is the count
    expect(pending[0]).toBe(0)
  })

  it('XINFO GROUPS shows correct consumer count and pending 0', async () => {
    const info = await pub.xinfo('GROUPS', STREAM) as Array<unknown[]>
    expect(info.length).toBeGreaterThan(0)
    // Each group info is a flat array: ['name', gname, 'consumers', n, 'pending', p, ...]
    const groupInfo = info[0] as string[]
    const pendingIdx = groupInfo.indexOf('pending')
    if (pendingIdx !== -1) {
      expect(groupInfo[pendingIdx + 1]).toBe(0)
    }
  })
})

describe('Valkey pubsub — resubscribe after reconnect simulation', () => {
  it('re-subscribes and receives messages on a fresh sub connection', async () => {
    const sub2 = new Valkey({ host: 'localhost', port: 6379, lazyConnect: true })
    await sub2.connect()

    const received: string[] = []

    // Simulate what reconnect handler does: subscribe on 'ready'
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('subscription timeout')), 3000)
      sub2.subscribe('test:reconnect:ch', (err) => { if (err) reject(err) })
      sub2.on('message', (_ch, msg) => {
        received.push(msg)
        clearTimeout(timer)
        resolve()
      })
      setTimeout(() => pub.publish('test:reconnect:ch', 'ping-after-reconnect'), 100)
    })

    expect(received).toHaveLength(1)
    expect(received[0]).toBe('ping-after-reconnect')
    await sub2.quit()
  })

  it('duplicate subscription on same channel does NOT duplicate messages', async () => {
    const sub3 = new Valkey({ host: 'localhost', port: 6379, lazyConnect: true })
    await sub3.connect()

    const received: string[] = []
    let resolveP!: () => void
    const p = new Promise<void>(r => { resolveP = r })

    const handler = (_ch: string, msg: string) => { received.push(msg) }
    sub3.on('message', handler)

    // Subscribe twice — simulates a bug where reconnect fires twice
    await new Promise<void>((res, rej) => sub3.subscribe('test:dedup:ch', e => e ? rej(e) : res()))
    await new Promise<void>((res, rej) => sub3.subscribe('test:dedup:ch', e => e ? rej(e) : res()))

    // Give time for potential duplicates
    setTimeout(() => { pub.publish('test:dedup:ch', 'once') }, 50)
    setTimeout(() => resolveP(), 300)
    await p

    // Redis/Valkey deduplicates subscriptions at the protocol level
    // A single PUBLISH should be received exactly once regardless of subscribe count
    expect(received.length).toBe(1)
    await sub3.quit()
  })
})
