// apps/ws-gateway/src/main.ts
import { createLogger } from '@crypto-platform/logger'
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config'
import { z } from 'zod'
import Valkey from 'iovalkey'
import uWS from 'uWebSockets.js'
import { ConnectionManager } from './connection-manager.js'
import { SubscriptionHandler } from './subscription-handler.js'
import { ValkeyFanout } from './valkey-fanout.js'

const env = loadEnv(BaseSchema.merge(ValkeySchema).merge(z.object({ WS_PORT: z.coerce.number().default(4000) })))
const log = createLogger('ws-gateway')

const valkeyOpts = { host: env.VALKEY_HOST, port: env.VALKEY_PORT }
const valkeyPub = new Valkey(valkeyOpts)
const cm = new ConnectionManager()
const subHdlr = new SubscriptionHandler(cm, valkeyPub, log)
const fanout = new ValkeyFanout(valkeyOpts, cm, log)

valkeyPub.on('error', (e: Error) => log.warn({ err: e.message }, 'valkeyPub error'))

// Rate limiting: макс 5 соединений в секунду с одного IP
const connectionCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW = 1000

// Очистка устаревших записей rate limiting каждые 60 секунд
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of connectionCounts) {
    if (entry.resetAt < now) {
      connectionCounts.delete(ip)
    }
  }
}, 60_000)

const app = uWS.App().ws('/*', {
  idleTimeout: 120,
  open(ws) {
    const ip = (ws as any).getRemoteAddressAsText?.() || 'unknown'
    const now = Date.now()
    const entry = connectionCounts.get(ip)
    if (entry) {
      if (now < entry.resetAt) {
        if (entry.count >= RATE_LIMIT) {
          log.warn({ ip }, 'Rate limit exceeded, closing connection')
          ws.end(1008, 'Rate limit exceeded')
          return
        }
        entry.count++
      } else {
        connectionCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
      }
    } else {
      connectionCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    }

    const id = crypto.randomUUID()
    ;(ws as any).__id = id
    ;(ws as any).__ip = ip
    cm.add(id, ws)
    ws.send(JSON.stringify({ type: 'welcome', clientId: id }))
  },
  message(ws, msg) {
    try {
      const { type, channels, symbol } = JSON.parse(Buffer.from(msg).toString())
      const id = (ws as any).__id as string
      if (type === 'subscribe') {
        subHdlr.subscribe(id, channels, symbol)
      } else if (type === 'unsubscribe') {
        subHdlr.unsubscribe(id, channels, symbol)
      }
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'ws message parse error')
    }
  },
  close(ws) {
    const id = (ws as any).__id as string
    subHdlr.unsubscribeAll(id)
    cm.remove(id)
  },
})

app.listen(env.WS_PORT, (tok: any) => {
  if (tok) log.info({ port: env.WS_PORT }, 'ws-gateway started')
  else {
    log.fatal('ws-gateway failed to start')
    process.exit(1)
  }
})

const hb = new Valkey(valkeyOpts)
hb.on('error', (e: Error) => log.warn({ err: e.message }, 'hb error'))

// Heartbeat interval
const heartbeatTimer = setInterval(async () => {
  try {
    await Promise.all([
      hb.set('heartbeat:ws-gateway', Date.now().toString(), 'EX', 30),
      hb.set('stat:active_clients', cm.count().toString(), 'EX', 30)
    ])
  } catch (err) {
    log.error({ err }, 'Heartbeat update failed')
  }
}, 5_000)

// Ping/pong mechanism
const pingTimer = setInterval(() => {
  const now = Date.now()
  const staleClients = cm.getStale(60_000) // 60 секунд без ping
  for (const client of staleClients) {
    log.info({ clientId: client.id }, 'Client stale, disconnecting')
    try {
      client.ws.close()
    } catch {}
    cm.remove(client.id)
  }

  // Отправляем ping всем активным
  for (const client of cm.all()) {
    try {
      client.ws.send('ping')
    } catch {}
  }
}, 30_000)

function shutdown() {
  log.info('Shutting down ws-gateway...')
  clearInterval(heartbeatTimer)
  clearInterval(pingTimer)
  clearInterval(cleanupInterval)
  fanout.close()
  valkeyPub.quit()
  hb.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)