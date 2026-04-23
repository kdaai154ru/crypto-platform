// apps/orchestrator/src/main.ts
import { createLogger } from '@crypto-platform/logger'
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config'
import Valkey from 'iovalkey'
import Fastify from 'fastify'
import { ModuleRegistry } from './module-registry.js'
import { HealthMonitor } from './health-monitor.js'
import { StatusBroadcaster } from './status-broadcaster.js'
import { z } from 'zod'

const env = loadEnv(BaseSchema.merge(ValkeySchema).merge(
  z.object({ ORCHESTRATOR_PORT: z.coerce.number().default(3010) })
))
const log = createLogger('orchestrator')

const valkey = new Valkey({ host: env.VALKEY_HOST, port: env.VALKEY_PORT })
const hbValkey = new Valkey({ host: env.VALKEY_HOST, port: env.VALKEY_PORT })

valkey.on('error', (err: Error) => log.error({ err }, 'Valkey main connection error'))
hbValkey.on('error', (err: Error) => log.error({ err }, 'Valkey heartbeat connection error'))

const registry = new ModuleRegistry(log)
const broadcaster = new StatusBroadcaster(valkey, log)

const monitor = new HealthMonitor(registry, hbValkey, async () => {
  let pairsRaw: string | null = null
  let clientsRaw: string | null = null
  let exchangesRaw: string | null = null
  try {
    ;[pairsRaw, clientsRaw, exchangesRaw] = await Promise.all([
      hbValkey.get('stat:active_pairs'),
      hbValkey.get('stat:active_clients'),
      hbValkey.get('system:status:exchanges'),
    ])
  } catch (err) {
    log.error({ err }, 'Failed to fetch stats from Valkey')
    return
  }

  const activePairs = pairsRaw ? parseInt(pairsRaw, 10) : 0
  const activeClients = clientsRaw ? parseInt(clientsRaw, 10) : 0
  let exchanges: any[] = []
  if (exchangesRaw) {
    try {
      exchanges = JSON.parse(exchangesRaw)
    } catch (err) {
      log.error({ err, exchangesRaw }, 'Failed to parse exchanges JSON')
    }
  }

  await broadcaster.broadcast(registry.all(), exchanges, activePairs, activeClients)
}, log)

const ipWhitelist = (req: any, reply: any, done: any) => {
  const ip = req.ip || req.socket.remoteAddress
  const allowed =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    (ip && ip.startsWith('10.')) // внутренняя сеть 10.0.0.0/8
  if (!allowed) {
    reply.status(403).send({ error: 'Forbidden' })
  } else {
    done()
  }
}

async function start() {
  monitor.start()
  const api = Fastify({ logger: false })

  api.addHook('onRequest', ipWhitelist)
  api.get('/health', async () => ({ status: 'ok', modules: registry.all() }))
  api.get('/status', async () => registry.all())

  await api.listen({ port: env.ORCHESTRATOR_PORT, host: '0.0.0.0' })
  log.info({ port: env.ORCHESTRATOR_PORT }, 'orchestrator started')
}

function shutdown() {
  log.info('Shutting down orchestrator...')
  monitor.stop()
  valkey.quit()
  hbValkey.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

start().catch(e => { log.fatal(e); process.exit(1) })