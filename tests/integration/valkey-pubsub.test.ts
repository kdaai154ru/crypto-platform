// tests/integration/valkey-pubsub.test.ts
// Requires a running Valkey instance at localhost:6379
// Run: docker compose -f infra/docker/docker-compose.yml up valkey -d
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Valkey from 'iovalkey';

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

describe('Valkey pubsub', () => {
  it('publishes and receives a message', async () => {
    const received = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 3000)
      sub.subscribe('test:channel', (err) => { if (err) reject(err) })
      sub.once('message', (_ch, msg) => { clearTimeout(timer); resolve(msg) })
      setTimeout(() => pub.publish('test:channel', 'hello'), 50)
    })
    expect(received).toBe('hello')
  })

  it('sets and gets a key with TTL', async () => {
    await pub.set('test:key', 'value', 'EX', 10)
    const val = await pub.get('test:key')
    expect(val).toBe('value')
    const ttl = await pub.ttl('test:key')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(10)
  })

  it('publishes JSON and parses correctly', async () => {
    const payload = { symbol: 'BTC/USDT', price: 50000, ts: Date.now() }
    const received = await new Promise<typeof payload>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 3000)
      sub.subscribe('test:json', (err) => { if (err) reject(err) })
      sub.once('message', (_ch, msg) => { clearTimeout(timer); resolve(JSON.parse(msg)) })
      setTimeout(() => pub.publish('test:json', JSON.stringify(payload)), 50)
    })
    expect(received.symbol).toBe('BTC/USDT')
    expect(received.price).toBe(50000)
  })
})
