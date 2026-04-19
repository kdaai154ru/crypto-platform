// cores/exchange-core/src/connector.ts
// ccxt@4.4.x не экспортирует ccxt/pro в package.json exports.
// Pro-классы живут в ccxt/dist/pro/<exchange>.js — грузим через dynamic import.
import type { ExchangeId } from '@crypto-platform/types';
import type { Logger } from '@crypto-platform/logger';
import { CircuitBreaker } from '@crypto-platform/utils';
import { ReconnectManager } from './reconnect-manager.js';
import { RateLimiter } from './rate-limiter.js';

export type TradeCallback   = (trade: any,  exchange: ExchangeId) => void;
export type TickerCallback  = (ticker: any, exchange: ExchangeId) => void;
export type CandleCallback  = (candle: any, symbol: string, tf: string, exchange: ExchangeId) => void;

const TRADES_LIMIT  = 50;
const CANDLES_LIMIT = 10;

/**
 * Загружает pro-класс биржи из ccxt/dist/pro/<id>.js
 * через dynamic import, обходя устаревший exports map ccxt@4.4.x
 */
async function loadProExchange(id: string): Promise<new (opts?: object) => any> {
  // Пробуем ccxt/dist/pro/<id> (есть в v4.4+)
  try {
    const mod = await import(`ccxt/dist/pro/${id}.js`);
    const ExClass = mod.default ?? mod[id];
    if (typeof ExClass === 'function') return ExClass;
  } catch { /* fallback ниже */ }

  // Fallback: основной ccxt (без WebSocket, только REST) — не должно доходиться
  const ccxt = await import('ccxt');
  const ExClass = (ccxt as any)[id] ?? (ccxt as any).default?.[id];
  if (typeof ExClass === 'function') {
    // Проверяем наличие watchTicker (есть только в pro)
    const inst = new ExClass();
    if (typeof inst.watchTicker !== 'function') {
      throw new Error(`ccxt.${id} does not support WebSocket streams — install ccxt@4.4+ with pro`);
    }
    return ExClass;
  }

  throw new Error(`Cannot load ccxt pro class for exchange: ${id}`);
}

export class ExchangeConnector {
  private ex!: any;
  private cb: CircuitBreaker;
  private rm: ReconnectManager;
  private rl: RateLimiter;
  private activeStreams = new Set<string>();
  public latencyMs     = 0;
  public lastMessageAt = 0;
  public restarts      = 0;

  constructor(
    public readonly id: ExchangeId,
    private readonly logger: Logger,
    private readonly onTrade:  TradeCallback,
    private readonly onTicker: TickerCallback,
    private readonly onCandle: CandleCallback,
  ) {
    this.cb = new CircuitBreaker(id);
    this.rm = new ReconnectManager(id, logger);
    this.rl = new RateLimiter(10);
  }

  async connect(): Promise<void> {
    if (this.ex) {
      try { await this.ex.close(); } catch {}
      this.ex = null;
    }
    const ExClass = await loadProExchange(this.id as string);
    this.ex = new ExClass({ enableRateLimit: true, timeout: 30_000, newUpdates: true });
    this.logger.info({ id: this.id }, 'connected');
  }

  async watchTrades(symbol: string): Promise<void> {
    const key = `trades:${symbol}`;
    if (this.activeStreams.has(key)) return;
    this.activeStreams.add(key);
    while (this.activeStreams.has(key)) {
      try {
        const trades = (await this.cb.execute(
          () => this.ex.watchTrades(symbol, undefined, TRADES_LIMIT)
        )) as any[];
        this.lastMessageAt = Date.now();
        for (const t of trades) this.onTrade(t, this.id);
        if (this.ex.trades?.[symbol]) this.ex.trades[symbol].clear?.();
      } catch (e) {
        this.logger.error({ symbol, err: e }, 'watchTrades error');
        this.restarts++;
        await this.rm.schedule(() => this.connect());
      }
    }
  }

  async watchTicker(symbol: string): Promise<void> {
    const key = `ticker:${symbol}`;
    if (this.activeStreams.has(key)) return;
    this.activeStreams.add(key);
    while (this.activeStreams.has(key)) {
      try {
        const ticker = await this.cb.execute(() => this.ex.watchTicker(symbol));
        this.lastMessageAt = Date.now();
        this.onTicker(ticker, this.id);
      } catch (e) {
        this.logger.error({ symbol, err: e }, 'watchTicker error');
        await this.rm.schedule(() => this.connect());
      }
    }
  }

  async watchOHLCV(symbol: string, tf: string): Promise<void> {
    const key = `ohlcv:${symbol}:${tf}`;
    if (this.activeStreams.has(key)) return;
    this.activeStreams.add(key);
    while (this.activeStreams.has(key)) {
      try {
        const candles = (await this.cb.execute(
          () => this.ex.watchOHLCV(symbol, tf, undefined, CANDLES_LIMIT)
        )) as any[];
        this.lastMessageAt = Date.now();
        for (const c of candles) this.onCandle(c, symbol, tf, this.id);
        if (this.ex.ohlcvs?.[symbol]?.[tf]) {
          const buf = this.ex.ohlcvs[symbol][tf];
          if (buf.length > CANDLES_LIMIT) buf.splice(0, buf.length - CANDLES_LIMIT);
        }
      } catch (e) {
        this.logger.error({ symbol, tf, err: e }, 'watchOHLCV error');
        await this.rm.schedule(() => this.connect());
      }
    }
  }

  stopSymbol(symbol: string): void {
    for (const key of [...this.activeStreams]) {
      if (key.includes(symbol)) this.activeStreams.delete(key);
    }
    this.logger.debug({ id: this.id, symbol }, 'stopSymbol');
  }

  stopAll() {
    this.activeStreams.clear();
    try { this.ex?.close?.(); } catch {}
  }

  streamCount(): number { return this.activeStreams.size; }
}
