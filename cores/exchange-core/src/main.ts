// cores/exchange-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import { z } from 'zod';
import { ExchangeConnector } from './connector.js';
import type { ExchangeId, Timeframe } from '@crypto-platform/types';
import {
  createMetricsServer,
  exchangeLatencyHistogram,
  type MetricsServer,
} from '@crypto-platform/metrics';

const DEFAULT_EXCHANGES: ExchangeId[] = ['binance', 'bybit', 'okx'];
const env = loadEnv(
  BaseSchema.merge(ValkeySchema).merge(
    z.object({
      EXCHANGE_LIST: z.string().optional(),
      METRICS_PORT: z.coerce.number().default(4002),
    })
  )
);
const log = createLogger('exchange-core');

const VALKEY_OPTS = {
  host: env.VALKEY_HOST,
  port: env.VALKEY_PORT,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  keepAlive: 10000,
  enableOfflineQueue: true,
};

const valkey = new Valkey(VALKEY_OPTS);
const sub    = new Valkey(VALKEY_OPTS);
const hb     = new Valkey(VALKEY_OPTS);

valkey.on('error', (e: Error) => log.warn({ err: e.message }, 'valkey error'));
sub.on('error',   (e: Error) => log.warn({ err: e.message }, 'sub error'));
hb.on('error',    (e: Error) => log.warn({ err: e.message }, 'hb error'));

const exList: ExchangeId[] =
  env.EXCHANGE_LIST?.split(',').map((s: string) => s.trim() as ExchangeId)
  ?? DEFAULT_EXCHANGES;

const connectors = new Map<ExchangeId, ExchangeConnector>();

const activeSymbols = new Set<string>();

function handleStreamStart(symbol: string, channels: string[]): void {
  const chs: string[] = channels ?? [];
  const needTicker = chs.length === 0 || chs.some((c) => c.startsWith('ticker:'));
  const needTrades = chs.length === 0 || chs.some((c) => c.startsWith('trades:'));
  const needOi     = chs.some((c) => c.startsWith('oi:'));
  const needFund   = chs.some((c) => c.startsWith('funding:'));

  const ohlcvTfs = [
    ...new Set(
      chs
        .filter((c) => c.startsWith('ohlcv:'))
        .map((c) => (c.split(':')[2] ?? '1m') as Timeframe)
    ),
  ];

  for (const [, conn] of connectors) {
    if (needTicker)
      conn.watchTicker(symbol)
          .catch((e: Error) => log.warn({ symbol, err: e.message }, 'watchTicker failed'));
    if (needTrades)
      conn.watchTrades(symbol)
          .catch((e: Error) => log.warn({ symbol, err: e.message }, 'watchTrades failed'));
    for (const tf of ohlcvTfs)
      conn.watchOHLCV(symbol, tf)
          .catch((e: Error) => log.warn({ symbol, tf, err: e.message }, 'watchOHLCV failed'));
    if (needOi)
      (conn as unknown as Record<string, (s: string) => Promise<void>>)
        .watchOI?.(symbol)
        ?.catch((e: Error) => log.warn({ symbol, err: e.message }, 'watchOI failed'));
    if (needFund)
      (conn as unknown as Record<string, (s: string) => Promise<void>>)
        .watchFunding?.(symbol)
        ?.catch((e: Error) => log.warn({ symbol, err: e.message }, 'watchFunding failed'));
  }

  activeSymbols.add(symbol);
  log.info({ symbol, chs }, 'streams started');
}

let metricsServer: MetricsServer | null = null;
let hbTimer: ReturnType<typeof setInterval> | null = null;

async function start(): Promise<void> {
  metricsServer = await createMetricsServer(env.METRICS_PORT);
  log.info({ port: env.METRICS_PORT }, 'Metrics server started');

  for (const id of exList) {
    const conn = new ExchangeConnector(
      id,
      log,
      (t, ex) => valkey.publish('raw:trades', JSON.stringify({ ...t, exchange: ex })),
      (tk, ex) => valkey.publish('raw:ticker', JSON.stringify({ ...tk, exchange: ex })),
      (c, sym, tf, ex) =>
        valkey.publish('raw:candle', JSON.stringify({ c, symbol: sym, tf, exchange: ex }))
    );
    try {
      await conn.connect();
      connectors.set(id, conn);
    } catch (e) {
      log.error({ id, err: e }, 'connect failed');
    }
  }

  await new Promise<void>((resolve, reject) => {
    sub.subscribe('stream:start', 'stream:stop', 'stream:replay', (e: Error | null) => {
      if (e) { log.error({ err: e }, 'sub.subscribe failed'); reject(e); }
      else resolve();
    });
  });

  sub.on('message', (ch: string, msg: string) => {
    try {
      const parsed = JSON.parse(msg) as {
        symbol: string;
        channels: string[];
        pairs?: Array<{ symbol: string; channels: string[] }>;
      };

      if (ch === 'stream:start') {
        handleStreamStart(parsed.symbol, parsed.channels);
      } else if (ch === 'stream:replay') {
        const pairs = parsed.pairs ?? [];
        log.info({ count: pairs.length }, 'replaying streams after reconnect');
        for (const { symbol, channels } of pairs) {
          if (activeSymbols.has(symbol)) {
            log.debug({ symbol }, 'stream:replay skipped — already active');
            continue;
          }
          handleStreamStart(symbol, channels);
        }
      } else if (ch === 'stream:stop') {
        if (!parsed.symbol) {
          log.warn('stream:stop received without symbol — ignoring');
          return;
        }
        for (const [, conn] of connectors) conn.stopSymbol(parsed.symbol);
        activeSymbols.delete(parsed.symbol);
        log.info({ symbol: parsed.symbol }, 'streams stopped');
      }
    } catch (e) {
      log.error(e);
    }
  });

  log.info('publishing exchange:ready');
  await valkey.publish('exchange:ready', JSON.stringify({ exchanges: exList }));

  hbTimer = setInterval(async () => {
    await hb.set('heartbeat:exchange-core', Date.now().toString(), 'EX', 30);
    const states = [...connectors.entries()].map(([id, conn]) => {
      exchangeLatencyHistogram.observe({ exchange: id, method: 'ws' }, conn.latencyMs);
      return {
        id,
        status: 'online',
        latencyMs: conn.latencyMs,
        lastMessageAt: conn.lastMessageAt,
        restarts: conn.restarts,
        streamCount: conn.streamCount(),
      };
    });
    await hb.set('system:status:exchanges', JSON.stringify(states), 'EX', 30);
  }, 5_000);

  const shutdown = async () => {
    log.info('Shutting down exchange-core...');
    if (hbTimer) clearInterval(hbTimer);
    connectors.forEach((c) => c.stopAll());
    valkey.quit();
    sub.quit();
    hb.quit();
    if (metricsServer) await metricsServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);

  log.info({ exchanges: exList }, 'exchange-core started');
}

start().catch((e) => {
  log.fatal(e);
  process.exit(1);
});
