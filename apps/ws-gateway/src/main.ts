// apps/ws-gateway/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema, JwtSchema } from '@crypto-platform/config';
import { z } from 'zod';
import Valkey from 'iovalkey';
import uWS from 'uWebSockets.js';
import { ConnectionManager } from './connection-manager.js';
import { SubscriptionHandler } from './subscription-handler.js';
import { ValkeyFanout } from './valkey-fanout.js';
import {
  createMetricsServer,
  wsConnectionsTotal,
  wsSubscriptionsTotal,
  activeClientsGauge,
  type MetricsServer,
} from '@crypto-platform/metrics';
import { createHmac } from 'node:crypto';

const env = loadEnv(
  BaseSchema.merge(ValkeySchema)
    .merge(JwtSchema.partial({ JWT_SECRET: true }))
    .merge(z.object({ WS_PORT: z.coerce.number().default(4000) }))
);
const log = createLogger('ws-gateway');

if (!env.JWT_SECRET) {
  log.warn('JWT_SECRET not set - WebSocket authentication disabled');
}

const valkeyOpts = { host: env.VALKEY_HOST, port: env.VALKEY_PORT };
const valkeyPub = new Valkey(valkeyOpts);
const cm = new ConnectionManager();
const subHdlr = new SubscriptionHandler(cm, valkeyPub, log);
const fanout = new ValkeyFanout(valkeyOpts, cm, log);

valkeyPub.on('error', (e: Error) => log.warn({ err: e.message }, 'valkeyPub error'));

// Rate limiting
const connectionCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 1000;

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of connectionCounts) {
    if (entry.resetAt < now) connectionCounts.delete(ip);
  }
}, 60_000);

/**
 * Проверяет JWT токен с использованием HS256.
 * @param token JWT токен
 * @param secret секретный ключ
 * @returns payload с полем sub или null при ошибке
 */
function verifyJwt(token: string, secret: string): { sub: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  
  const [headerB64, payloadB64, signatureB64] = parts;
  
  // Проверяем подпись
  const unsigned = `${headerB64}.${payloadB64}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64url');
  
  if (signatureB64 !== expectedSignature) return null;
  
  // Парсим payload
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    
    // Проверяем срок действия
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    
    // Проверяем наличие sub
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

const app = uWS.App().ws('/*', {
  idleTimeout: 120,
  
  upgrade(res, req, context) {
    const query = req.getQuery();
    const params = query ? new URLSearchParams(query) : null;
    const token = params?.get('token') ?? '';
    
    res.upgrade(
      { token },
      req.getHeader('sec-websocket-key'),
      req.getHeader('sec-websocket-protocol'),
      req.getHeader('sec-websocket-extensions'),
      context
    );
  },
  
  open(ws) {
    const ip = (ws as any).getRemoteAddressAsText?.() || 'unknown';
    
    // JWT аутентификация (если секрет задан)
    if (env.JWT_SECRET) {
      const userData = ws.getUserData() as { token: string };
      const token = userData?.token;
      
      if (!token) {
        log.warn({ ip }, 'Missing JWT token, closing connection');
        ws.end(1008, 'Missing authentication token');
        return;
      }
      
      const payload = verifyJwt(token, env.JWT_SECRET);
      if (!payload) {
        log.warn({ ip }, 'Invalid JWT token, closing connection');
        ws.end(1008, 'Invalid authentication token');
        return;
      }
      
      (ws as any).__userId = payload.sub;
      log.debug({ userId: payload.sub, ip }, 'Client authenticated');
    }
    
    // Rate limiting
    const now = Date.now();
    const entry = connectionCounts.get(ip);
    if (entry) {
      if (now < entry.resetAt) {
        if (entry.count >= RATE_LIMIT) {
          log.warn({ ip }, 'Rate limit exceeded, closing connection');
          ws.end(1008, 'Rate limit exceeded');
          return;
        }
        entry.count++;
      } else {
        connectionCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
      }
    } else {
      connectionCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    }

    const id = crypto.randomUUID();
    (ws as any).__id = id;
    (ws as any).__ip = ip;
    cm.add(id, ws);
    ws.send(JSON.stringify({ type: 'welcome', clientId: id }));
    wsConnectionsTotal.inc();
  },
  
  message(ws, msg) {
    try {
      const { type, channels, symbol } = JSON.parse(Buffer.from(msg).toString());
      const id = (ws as any).__id as string;
      if (type === 'subscribe') subHdlr.subscribe(id, channels, symbol);
      else if (type === 'unsubscribe') subHdlr.unsubscribe(id, channels, symbol);
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'ws message parse error');
    }
  },
  
  close(ws) {
    const id = (ws as any).__id as string;
    subHdlr.unsubscribeAll(id);
    cm.remove(id);
    wsConnectionsTotal.dec();
  },
});

app.listen(env.WS_PORT, (tok: any) => {
  if (tok) log.info({ port: env.WS_PORT }, 'ws-gateway started');
  else {
    log.fatal('ws-gateway failed to start');
    process.exit(1);
  }
});

const hb = new Valkey(valkeyOpts);
hb.on('error', (e: Error) => log.warn({ err: e.message }, 'hb error'));

const heartbeatTimer = setInterval(async () => {
  try {
    await Promise.all([
      hb.set('heartbeat:ws-gateway', Date.now().toString(), 'EX', 30),
      hb.set('stat:active_clients', cm.count().toString(), 'EX', 30),
    ]);
  } catch (err) {
    log.error({ err }, 'Heartbeat update failed');
  }
}, 5_000);

const pingTimer = setInterval(() => {
  const staleClients = cm.getStale(60_000);
  for (const client of staleClients) {
    try {
      client.ws.close();
    } catch {}
    cm.remove(client.id);
  }
  for (const client of cm.all()) {
    try {
      client.ws.ping();
    } catch {}
  }
}, 30_000);

const metricsTimer = setInterval(() => {
  const clients = cm.all();
  let totalSubscriptions = 0;
  for (const c of clients) totalSubscriptions += c.subscriptions.size;
  wsSubscriptionsTotal.set(totalSubscriptions);
  activeClientsGauge.set(clients.length);
  wsConnectionsTotal.set(clients.length);
}, 5_000);

let metricsServer: MetricsServer | null = null;

async function startMetrics() {
  metricsServer = await createMetricsServer(4001);
  log.info({ port: 4001 }, 'Metrics server started');
}

function shutdown() {
  log.info('Shutting down ws-gateway...');
  clearInterval(heartbeatTimer);
  clearInterval(pingTimer);
  clearInterval(cleanupInterval);
  clearInterval(metricsTimer);
  fanout.close();
  valkeyPub.quit();
  hb.quit();
  if (metricsServer) {
    metricsServer.close().catch((err) => log.error({ err }, 'Error closing metrics server'));
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startMetrics().catch((e) => {
  log.fatal(e);
  process.exit(1);
});