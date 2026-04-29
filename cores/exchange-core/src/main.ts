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

// #1 Expanded exchange list: 11 most stable exchanges
// priority 1 = full WS, priority 2 = WS with fallback, priority 3 = REST polling
const EXCHANGES_CONFIG: { id: ExchangeId; priority: 1 | 2 | 3; hasWs: boolean }[] = [
  { id: 'binance',    priority: 1, hasWs: true  },
  { id: 'bybit',      priority: 1, hasWs: true  },
  { id: 'okx',        priority: 1, hasWs: true  },
  { id: 'gate',       priority: 2, hasWs: true  },
  { id: 'kucoin',     priority: 2, hasWs: true  },
  { id: 'mexc',       priority: 2, hasWs: true  },
  { id: 'bitget',     priority: 2, hasWs: true  },
  { id: 'htx',        priority: 3, hasWs: true  },
  { id: 'coinbase',   priority: 3, hasWs: false },
  { id: 'kraken',     priority: 3, hasWs: true  },
  { id: 'cryptocom',  priority: 3, hasWs: false },
];

const DEFAULT_EXCHANGES: ExchangeId[] = EXCHANGES_CONFIG.map(e => e.id);

// FIX: DEFAULT_SYMBOLS — symbols to start streaming immediately on boot
const DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT'];

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
  ...(env.VALKEY_PASSWORD ? { password: env.VALKEY_PASSWORD } : {}),
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

// #1: respect EXCHANGE_LIST env override, otherwise use all 11
const exList: ExchangeId[] =
  env.EXCHANGE_LIST?.split(',').map((s: string) => s.trim() as ExchangeId)
  ?? DEFAULT_EXCHANGES;

// REST-only exchanges — polled every 3s instead of WS
const REST_ONLY_EXCHANGES = new Set(
  EXCHANGES_CONFIG.filter(e => !e.hasWs).map(e => e.id)
);

const connectors = new Map<ExchangeId, ExchangeConnector>();
const activeSymbols = new Set<string>();

const StreamStartSchema = z.object({
  symbol: z.string().min(1),
  channels: z.array(z.string()).default([]),
});
const StreamStopSchema = z.object({
  symbol: z.string().min(1),
});
const StreamReplaySchema = z.object({
  pairs: z.array(z.object({
    symbol: z.string().min(1),
    channels: z.array(z.string()).default([]),
  })).default([]),
});

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
  if (ohlcvTfs.length === 0 && (chs.length === 0)) {
    ohlcvTfs.push('1m' as Timeframe);
  }

  for (const [id, conn] of connectors) {
    const isRestOnly = REST_ONLY_EXCHANGES.has(id);
    if (needTicker)
      conn.watchTicker(symbol)
          .catch((e: Error) => log.warn({ symbol, err: e.message }, 'watchTicker failed'));
    if (needTrades && !isRestOnly)
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

// #2: Load all active USDT symbols from Binance on boot and cache to Valkey
async function loadAndCacheUsdtSymbols(): Promise<void> {
  try {
    log.info('Loading all USDT symbols from Binance...');
    const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { symbols: { symbol: string; status: string; quoteAsset: string }[] } = await res.json();
    const usdtSymbols = data.symbols
      .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map(s => s.symbol);
    await valkey.set('symbols:usdt:all', JSON.stringify(usdtSymbols), 'EX', 3600);
    log.info({ count: usdtSymbols.length }, 'USDT symbols cached to Valkey');
  } catch (e) {
    log.warn({ err: e }, 'Failed to load USDT symbols, skipping cache');
  }
}

let metricsServer: MetricsServer | null = null;
let hbTimer: ReturnType<typeof setInterval> | null = null;

function subscribeControlChannels(): void {
  sub.subscribe('stream:start', 'stream:stop', 'stream:replay', (e: Error | null | undefined) => {
    if (e) log.error({ err: e }, 'sub.subscribe failed');
    else log.info('exchange-core subscribed to control channels');
  });
}

async function start(): Promise<void> {
  metricsServer = await createMetricsServer(env.METRICS_PORT);
  log.info({ port: env.METRICS_PORT }, 'Metrics server started');

  // #2: cache USDT symbols before accepting connections
  await loadAndCacheUsdtSymbols();

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
      log.info({ id }, 'exchange connected');
    } catch (e) {
      log.error({ id, err: e }, 'connect failed — skipping');
    }
  }

  sub.on('message', (ch: string, msg: string) => {
    try {
      if (ch === 'stream:start') {
        const result = StreamStartSchema.safeParse(JSON.parse(msg));
        if (!result.success) {
          log.warn({ err: result.error.message }, 'stream:start invalid payload, ignoring');
          return;
        }
        handleStreamStart(result.data.symbol, result.data.channels);

      } else if (ch === 'stream:replay') {
        const result = StreamReplaySchema.safeParse(JSON.parse(msg));
        if (!result.success) {
          log.warn({ err: result.error.message }, 'stream:replay invalid payload, ignoring');
          return;
        }
        log.info({ count: result.data.pairs.length }, 'replaying streams after reconnect');
        for (const { symbol, channels } of result.data.pairs) {
          if (activeSymbols.has(symbol)) {
            log.debug({ symbol }, 'stream:replay skipped — already active');
            continue;
          }
          handleStreamStart(symbol, channels);
        }

      } else if (ch === 'stream:stop') {
        const result = StreamStopSchema.safeParse(JSON.parse(msg));
        if (!result.success) {
          log.warn({ err: result.error.message }, 'stream:stop invalid payload, ignoring');
          return;
        }
        for (const [, conn] of connectors) conn.stopSymbol(result.data.symbol);
        activeSymbols.delete(result.data.symbol);
        log.info({ symbol: result.data.symbol }, 'streams stopped');
      }
    } catch (e) {
      log.error(e);
    }
  });

  sub.on('ready', () => {
    log.info('Valkey sub ready, resubscribing to control channels');
    subscribeControlChannels();
  });

  await new Promise<void>((resolve, reject) => {
    sub.subscribe('stream:start', 'stream:stop', 'stream:replay', (e: Error | null | undefined) => {
      if (e) { log.error({ err: e }, 'sub.subscribe failed'); reject(e); }
      else resolve();
    });
  });

  log.info('publishing exchange:ready');
  await valkey.publish('exchange:ready', JSON.stringify({ exchanges: exList }));

  log.info({ symbols: DEFAULT_SYMBOLS }, 'starting default symbol streams');
  for (const sym of DEFAULT_SYMBOLS) {
    handleStreamStart(sym, []);
  }

  hbTimer = setInterval(() => {
    hb.set('heartbeat:exchange-core', Date.now().toString(), 'EX', 30)
      .catch((e: Error) => log.warn({ err: e.message }, 'hb set failed'));
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
    hb.set('system:status:exchanges', JSON.stringify(states), 'EX', 30)
      .catch((e: Error) => log.warn({ err: e.message }, 'hb status set failed'));
  }, 5_000);

  // #2: refresh USDT symbol cache every hour
  setInterval(loadAndCacheUsdtSymbols, 3_600_000);

  const shutdown = async () => {
    log.info('Shutting down exchange-core...');
    if (hbTimer) clearInterval(hbTimer);
    connectors.forEach((c) => c.stopAll());
    await Promise.allSettled([valkey.quit(), sub.quit(), hb.quit()]);
    if (metricsServer) await metricsServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log.info({ exchanges: exList, total: connectors.size }, 'exchange-core started');
}

start().catch((e) => {
  log.fatal(e);
  process.exit(1);
});
