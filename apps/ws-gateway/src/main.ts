// apps/ws-gateway/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema, JwtSchema } from '@crypto-platform/config';
import { z } from 'zod';
import Valkey from 'iovalkey';
import uWS from 'uWebSockets.js';
import { ConnectionManager } from './connection-manager.js';
import { SubscriptionHandler } from './subscription-handler.js';
import { ValkeyStreams } from './valkey-streams.js';
import {
  createMetricsServer,
  wsConnectionsTotal,
  wsSubscriptionsTotal,
  activeClientsGauge,
  type MetricsServer,
} from '@crypto-platform/metrics';
import { createHmac, timingSafeEqual } from 'node:crypto';


const env = loadEnv(
  BaseSchema.merge(ValkeySchema)
    .merge(JwtSchema.partial({ JWT_SECRET: true }))
    .merge(z.object({
      WS_PORT: z.coerce.number().default(4000),
      METRICS_PORT: z.coerce.number().default(4001),
      // FIX #14: список разрешённых Origin для защиты от CSWSH
      // Пустая строка = Origin не проверяется (режим разработки)
      WS_ALLOWED_ORIGINS: z.string().optional(),
    }))
);
const log = createLogger('ws-gateway');

// FIX #14: разбираем список разрешённых Origins из env
const allowedOrigins: Set<string> | null = env.WS_ALLOWED_ORIGINS
  ? new Set(env.WS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean))
  : null;

if (!allowedOrigins) {
  log.warn('WS_ALLOWED_ORIGINS not set — Origin validation disabled (unsafe for production)');
}


if (!env.JWT_SECRET) {
  log.warn('JWT_SECRET not set - WebSocket authentication disabled');
}


const valkeyOpts = { host: env.VALKEY_HOST, port: env.VALKEY_PORT };
const valkeyPub = new Valkey(valkeyOpts);
const cm = new ConnectionManager();
const subHdlr = new SubscriptionHandler(cm, valkeyPub, log);
const fanout = new ValkeyStreams(valkeyOpts, cm, log);


valkeyPub.on('error', (e: Error) => log.warn({ err: e.message }, 'valkeyPub error'));


// Rate limiting — ограничиваем размер Map чтобы не допустить OOM при IPv6 DDoS
const MAX_RATE_ENTRIES = 10_000;
const connectionCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 1000;


const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of connectionCounts) {
    if (entry.resetAt < now) connectionCounts.delete(ip);
  }
  if (connectionCounts.size > MAX_RATE_ENTRIES) {
    const toDelete = connectionCounts.size - MAX_RATE_ENTRIES;
    let deleted = 0;
    for (const key of connectionCounts.keys()) {
      if (deleted >= toDelete) break;
      connectionCounts.delete(key);
      deleted++;
    }
  }
}, 60_000);


// uWS.getRemoteAddressAsText() возвращает ArrayBuffer, не строку
function getClientIp(ws: uWS.WebSocket<unknown>): string {
  try {
    const buf = (ws as any).getRemoteAddressAsText?.();
    if (!buf) return 'unknown';
    return Buffer.from(buf as ArrayBuffer).toString();
  } catch {
    return 'unknown';
  }
}


// timingSafeEqual для защиты от timing attack
// проверка nbf (не использовать токен раньше времени выпуска)
// проверка header.alg === 'HS256'
function verifyJwt(token: string, secret: string): { sub: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;


  const [headerB64, payloadB64, signatureB64] = parts;


  try {
    const headerJson = Buffer.from(headerB64!, 'base64url').toString('utf-8');
    const header = JSON.parse(headerJson);
    if (header.alg !== 'HS256') return null;
    if (header.typ !== undefined && header.typ !== 'JWT') return null;
  } catch {
    return null;
  }


  const unsigned = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret)
    .update(unsigned)
    .digest();
  const providedSig = Buffer.from(signatureB64!, 'base64url');


  if (
    expectedSig.length !== providedSig.length ||
    !timingSafeEqual(expectedSig, providedSig)
  ) {
    return null;
  }


  try {
    const payloadJson = Buffer.from(payloadB64!, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    if (payload.nbf && Date.now() / 1000 < payload.nbf) return null;
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}


const app = uWS.App().ws('/*', {
  idleTimeout: 120,


  upgrade(res, req, context) {
    // FIX #14: Origin validation — защита от Cross-Site WebSocket Hijacking (CSWSH)
    const origin = req.getHeader('origin');
    if (allowedOrigins && origin && !allowedOrigins.has(origin)) {
      log.warn({ origin }, 'WebSocket upgrade rejected: Origin not allowed');
      res.writeStatus('403 Forbidden').end('Origin not allowed');
      return;
    }

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
    const ip = getClientIp(ws);


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
    activeClientsGauge.set(cm.count());
  },


  message(ws, msg, isBinary) {
    if (isBinary) return;
    const id = (ws as any).__id as string;
    try {
      const text = Buffer.from(msg).toString();
      const data = JSON.parse(text) as { type?: string; channels?: string[]; symbol?: string };


      if (!data || typeof data.type !== 'string') {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing message type' }));
        return;
      }


      if (data.type === 'subscribe') {
        subHdlr.subscribe(id, data.channels ?? [], data.symbol);
      } else if (data.type === 'unsubscribe') {
        subHdlr.unsubscribe(id, data.channels ?? [], data.symbol);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${data.type}` }));
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  },


  close(ws) {
    const id = (ws as any).__id as string;
    cm.remove(id);
    subHdlr.unsubscribeAll(id);
    activeClientsGauge.set(cm.count());
  },
});


async function start(): Promise<void> {
  let metricsServer: MetricsServer;
  try {
    metricsServer = await createMetricsServer(env.METRICS_PORT);
    log.info({ port: env.METRICS_PORT }, 'Metrics server started');
  } catch (e) {
    log.fatal({ err: e }, 'Failed to start metrics server, aborting');
    process.exit(1);
  }


  await new Promise<void>((resolve, reject) => {
    app.listen(env.WS_PORT, (token) => {
      if (token) {
        log.info({ port: env.WS_PORT }, 'ws-gateway started');
        resolve();
      } else {
        reject(new Error(`Failed to listen on port ${env.WS_PORT}`));
      }
    });
  });


  const shutdown = async () => {
    log.info('Shutting down ws-gateway...');
    clearInterval(cleanupInterval);
    await fanout.close();
    valkeyPub.quit();
    await metricsServer!.close();
    process.exit(0);
  };


  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}


start().catch((e) => {
  log.fatal(e);
  process.exit(1);
});
