// apps/orchestrator/src/main.ts
import { createLogger } from '@crypto-platform/logger'
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config'
import Valkey from 'iovalkey';
import Fastify from 'fastify'
import { ModuleRegistry } from './module-registry.js'
import { HealthMonitor } from './health-monitor.js'
import { StatusBroadcaster } from './status-broadcaster.js'
import { z } from 'zod'

const env = loadEnv(BaseSchema.merge(ValkeySchema).merge(
  z.object({ ORCHESTRATOR_PORT: z.coerce.number().default(3010) })
))
const log = createLogger('orchestrator')
const valkey   = new Valkey({ host: env.VALKEY_HOST, port: env.VALKEY_PORT })
const hbValkey = new Valkey({ host: env.VALKEY_HOST, port: env.VALKEY_PORT })

const registry    = new ModuleRegistry(log)
const broadcaster = new StatusBroadcaster(valkey)

const monitor = new HealthMonitor(registry, hbValkey, async () => {
  // Читаем activePairs и activeClients из Valkey
  const [pairsRaw, clientsRaw, exchangesRaw] = await Promise.all([
    hbValkey.get('stat:active_pairs'),
    hbValkey.get('stat:active_clients'),
    hbValkey.get('system:status:exchanges'),
  ])
  const activePairs   = pairsRaw   ? parseInt(pairsRaw)   : 0
  const activeClients = clientsRaw ? parseInt(clientsRaw) : 0
  const exchanges     = exchangesRaw ? JSON.parse(exchangesRaw) : []

  broadcaster.broadcast(registry.all(), exchanges, activePairs, activeClients)
}, log)

async function start() {
  monitor.start()
  const api = Fastify({ logger: false })
  api.get('/health', async () => ({ status: 'ok', modules: registry.all() }))
  api.get('/status', async () => registry.all())
  await api.listen({ port: env.ORCHESTRATOR_PORT, host: '0.0.0.0' })
  log.info({ port: env.ORCHESTRATOR_PORT }, 'orchestrator started')
}

start().catch(e => { log.fatal(e); process.exit(1) })
process.on('SIGTERM', () => { monitor.stop(); valkey.quit(); hbValkey.quit(); process.exit(0) })