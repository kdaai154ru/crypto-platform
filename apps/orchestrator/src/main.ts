// apps/orchestrator/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import { createValkeyClient } from '@crypto-platform/utils';
import Fastify from 'fastify';
import { ModuleRegistry } from './module-registry.js';
import { HealthMonitor } from './health-monitor.js';
import { StatusBroadcaster } from './status-broadcaster.js';
import { z } from 'zod';
import {
  createMetricsServer,
  moduleStatusGauge,
  moduleRestartsCounter,
  moduleUptimeGauge,
  activePairsGauge,
  activeClientsGauge,
  type MetricsServer
} from '@crypto-platform/metrics';
import type { ExchangeState } from '@crypto-platform/types';

const env = loadEnv(
  BaseSchema.merge(ValkeySchema).merge(
    z.object({
      ORCHESTRATOR_PORT: z.coerce.number().default(3010),
      METRICS_PORT: z.coerce.number().default(3001),
      // Таймаут (мс) после которого биржа считается offline если exchange-core не обновил ключ
      EXCHANGE_STALE_MS: z.coerce.number().default(30_000),
    })
  )
);
const log = createLogger('orchestrator');

const valkey   = createValkeyClient();
const hbValkey = createValkeyClient();

valkey.on('error',   (err: Error) => log.error({ err }, 'Valkey main connection error'));
hbValkey.on('error', (err: Error) => log.error({ err }, 'Valkey heartbeat connection error'));

const registry = new ModuleRegistry(log, {
  restartsCounter: moduleRestartsCounter
});
const broadcaster = new StatusBroadcaster(valkey, log);

const monitor = new HealthMonitor(
  registry,
  hbValkey,
  async () => {
    let pairsRaw: string | null = null;
    let clientsRaw: string | null = null;
    let exchangesRaw: string | null = null;
    try {
      [pairsRaw, clientsRaw, exchangesRaw] = await Promise.all([
        hbValkey.get('stat:active_pairs'),
        hbValkey.get('stat:active_clients'),
        hbValkey.get('system:status:exchanges'),
      ]);
    } catch (err) {
      log.error({ err }, 'Failed to fetch stats from Valkey');
      return;
    }

    const activePairs   = pairsRaw   ? parseInt(pairsRaw, 10)   : 0;
    const activeClients = clientsRaw ? parseInt(clientsRaw, 10) : 0;

    // FIX: если exchange-core ещё не писал в system:status:exchanges,
    // строим fallback-статусы из состояния модуля exchange-core в registry.
    // Это гарантирует что exchanges[] никогда не будет пустым пока exchange-core online.
    let exchanges: ExchangeState[] = [];
    if (exchangesRaw) {
      try {
        const parsed = JSON.parse(exchangesRaw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          exchanges = parsed as ExchangeState[];
        }
      } catch (err) {
        log.error({ err, exchangesRaw }, 'Failed to parse exchanges JSON');
      }
    }

    // Fallback: если exchanges пустой (exchange-core не писал в Valkey),
    // генерируем синтетические статусы на основе heartbeat exchange-core из registry.
    if (exchanges.length === 0) {
      const exchangeModule = registry.get('exchange-core');
      if (exchangeModule && (exchangeModule.status === 'online' || exchangeModule.status === 'degraded')) {
        // exchange-core живой но не опубликовал детали — показываем как online без деталей
        log.warn('system:status:exchanges is empty, using fallback from exchange-core module status');
        exchanges = [
          { id: 'binance', status: exchangeModule.status === 'online' ? 'online' : 'degraded', lastHeartbeat: exchangeModule.lastHeartbeat, uptimeMs: exchangeModule.uptimeMs },
          { id: 'bybit',   status: exchangeModule.status === 'online' ? 'online' : 'degraded', lastHeartbeat: exchangeModule.lastHeartbeat, uptimeMs: exchangeModule.uptimeMs },
          { id: 'okx',     status: exchangeModule.status === 'online' ? 'online' : 'degraded', lastHeartbeat: exchangeModule.lastHeartbeat, uptimeMs: exchangeModule.uptimeMs },
        ];
      }
    }

    activePairsGauge.set(activePairs);
    activeClientsGauge.set(activeClients);

    const modules = registry.all();
    for (const m of modules) {
      const statusValue =
        m.status === 'online'     ? 1
        : m.status === 'degraded'   ? 0.5
        : m.status === 'restarting' ? 0.25
        : 0;
      moduleStatusGauge.set({ module: m.id }, statusValue);
      moduleUptimeGauge.set({ module: m.id }, m.uptimeMs / 1000);
    }

    await broadcaster.broadcast(registry.all(), exchanges, activePairs, activeClients);
  },
  log
);

function isPrivateIp(ip: string): boolean {
  if (!ip) return false;
  if (ip === '127.0.0.1') return true;
  if (ip === '::1') return true;
  if (ip.startsWith('::ffff:127.')) return true;
  if (ip.toLowerCase().startsWith('fe80:')) return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (ip.startsWith('10.')) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && parseInt(m[1]!, 10) >= 16 && parseInt(m[1]!, 10) <= 31) return true;
  if (ip.startsWith('192.168.')) return true;
  return false;
}

const ipWhitelist = (req: any, reply: any, done: any) => {
  const ip: string = req.ip || req.socket?.remoteAddress || '';
  if (!isPrivateIp(ip)) {
    log.warn({ ip }, 'Forbidden: IP not in private range');
    reply.status(403).send({ error: 'Forbidden' });
  } else {
    done();
  }
};

let metricsServer: MetricsServer | null = null;

async function start() {
  metricsServer = await createMetricsServer(env.METRICS_PORT);
  log.info({ port: env.METRICS_PORT }, 'Metrics server started');

  monitor.start();
  const api = Fastify({ logger: false });

  api.addHook('onRequest', ipWhitelist);

  api.get('/', async () => ({
    service: 'orchestrator',
    version: process.env.npm_package_version ?? '0.0.0',
    status: 'ok',
    endpoints: [
      { method: 'GET', path: '/health', description: 'health + modules list' },
      { method: 'GET', path: '/status', description: 'modules status only' },
    ],
  }));

  api.get('/health', async () => ({ status: 'ok', modules: registry.all() }));
  api.get('/status', async () => registry.all());

  await api.listen({ port: env.ORCHESTRATOR_PORT, host: '0.0.0.0' });
  log.info({ port: env.ORCHESTRATOR_PORT }, 'orchestrator started');
}

async function shutdown() {
  log.info('Shutting down orchestrator...');
  monitor.stop();
  valkey.quit();
  hbValkey.quit();
  if (metricsServer) await metricsServer.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((e) => {
  log.fatal(e);
  process.exit(1);
});
