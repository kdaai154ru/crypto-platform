// cores/exchange-core/src/connector.ts
import ccxtLib from 'ccxt';
import type * as ccxt from 'ccxt';
import type { ExchangeId } from '@crypto-platform/types';
import type { Logger } from '@crypto-platform/logger';
import { CircuitBreaker } from '@crypto-platform/utils';
import { ReconnectManager } from './reconnect-manager.js';
import { RateLimiter } from './rate-limiter.js';

// ccxt.pro is not in the public type declarations — access via cast.
const pro = (ccxtLib as unknown as Record<string, unknown>).pro as
  Record<string, new (o?: object) => ccxt.Exchange> | undefined;

if (!pro || typeof pro !== 'object') {
  throw new Error('ccxt.pro namespace not found — upgrade ccxt to v4.4+');
}

export type TradeCallback  = (trade: ccxt.Trade,   exchange: ExchangeId) => void;
export type TickerCallback = (ticker: ccxt.Ticker, exchange: ExchangeId) => void;
export type CandleCallback = (candle: ccxt.OHLCV,  symbol: string, tf: string, exchange: ExchangeId) => void;

const TRADES_LIMIT = 50;
const CANDLES_LIMIT = 10;
const MAX_STREAMS = 100;
const LATENCY_SAMPLES = 10;
const MAX_CONSECUTIVE_ERRORS = 5;

export interface ConnectorStats {
  id: ExchangeId;
  streamCount: number;
  latencyMs: number;
  lastMessageAt: number;
  restarts: number;
  circuitState: string;
}

export class ExchangeConnector {
  private ex!: ccxt.Exchange;
  private cb: CircuitBreaker;
  private rm: ReconnectManager;
  private rl: RateLimiter;
  private activeStreams = new Set<string>();
  private stoppingStreams = new Set<string>();
  private latencySamples: number[] = [];
  private consecutiveErrors = new Map<string, number>();
  private isReconnecting = false;
  public latencyMs = 0;
  public lastMessageAt = 0;
  public restarts = 0;

  constructor(
    public readonly id: ExchangeId,
    private readonly logger: Logger,
    private readonly onTrade: TradeCallback,
    private readonly onTicker: TickerCallback,
    private readonly onCandle: CandleCallback
  ) {
    this.cb = new CircuitBreaker(id);
    this.rm = new ReconnectManager(id, logger);
    this.rl = new RateLimiter(10);
  }

  async connect(): Promise<void> {
    if (this.ex) {
      try { await this.ex.close(); } catch { /* ignore */ }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this as any).ex = null;
    }
    const ExClass = pro![this.id as string];
    if (!ExClass) throw new Error(`Unknown exchange: ${this.id}`);
    this.ex = new ExClass({
      enableRateLimit: true,
      timeout: 30_000,
      newUpdates: true,
    });
    this.logger.info({ id: this.id }, 'connected');
  }

  private updateLatency(duration: number): void {
    this.latencySamples.push(duration);
    if (this.latencySamples.length > LATENCY_SAMPLES) this.latencySamples.shift();
    const sum = this.latencySamples.reduce((a, b) => a + b, 0);
    this.latencyMs = Math.round(sum / this.latencySamples.length);
  }

  private handleStreamError(streamKey: string, err: unknown): void {
    const count = (this.consecutiveErrors.get(streamKey) ?? 0) + 1;
    this.consecutiveErrors.set(streamKey, count);
    if (count >= MAX_CONSECUTIVE_ERRORS) {
      this.logger.error({ streamKey, err }, 'Too many consecutive errors, opening circuit breaker');
      this.cb.open();
    }
  }

  private resetConsecutiveErrors(streamKey: string): void {
    this.consecutiveErrors.delete(streamKey);
  }

  private async reconnect(): Promise<void> {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    try {
      await this.rm.schedule(() => this.connect());
      this.restarts++;
      // FIX: reset CircuitBreaker after successful reconnect so streams
      // can resume immediately instead of waiting 30s recovery timeout.
      // Without this, CB stays OPEN → every watchTicker throws instantly
      // → handleStreamError increments counter → cb.open() resets openAt
      // → CB never reaches HALF_OPEN → infinite death loop.
      this.cb.reset();
      this.consecutiveErrors.clear();
      this.logger.info({ id: this.id }, 'CircuitBreaker reset after reconnect');
    } finally {
      this.isReconnecting = false;
    }
  }

  async watchTrades(symbol: string): Promise<void> {
    const key = `trades:${symbol}`;
    if (this.activeStreams.size >= MAX_STREAMS) {
      this.logger.warn({ id: this.id, size: this.activeStreams.size }, 'Max streams limit reached');
      return;
    }
    if (this.activeStreams.has(key) || this.stoppingStreams.has(key)) return;
    this.activeStreams.add(key);
    while (this.activeStreams.has(key) && !this.stoppingStreams.has(key)) {
      while (this.isReconnecting) {
        await new Promise<void>(resolve => setTimeout(resolve, 200));
      }
      const start = Date.now();
      try {
        const trades = (await this.cb.execute(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.ex as any).watchTrades(symbol, undefined, TRADES_LIMIT)
        )) as ccxt.Trade[];
        this.updateLatency(Date.now() - start);
        this.lastMessageAt = Date.now();
        for (const t of trades) this.onTrade(t, this.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(this.ex as any).trades?.[symbol]?.clear?.();
        this.resetConsecutiveErrors(key);
      } catch (e) {
        this.logger.error({ symbol, err: e }, 'watchTrades error');
        this.handleStreamError(key, e);
        await this.reconnect();
      }
    }
    this.activeStreams.delete(key);
    this.stoppingStreams.delete(key);
  }

  async watchTicker(symbol: string): Promise<void> {
    const key = `ticker:${symbol}`;
    if (this.activeStreams.size >= MAX_STREAMS) {
      this.logger.warn({ id: this.id, size: this.activeStreams.size }, 'Max streams limit reached');
      return;
    }
    if (this.activeStreams.has(key) || this.stoppingStreams.has(key)) return;
    this.activeStreams.add(key);
    while (this.activeStreams.has(key) && !this.stoppingStreams.has(key)) {
      while (this.isReconnecting) {
        await new Promise<void>(resolve => setTimeout(resolve, 200));
      }
      const start = Date.now();
      try {
        const ticker = (await this.cb.execute(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.ex as any).watchTicker(symbol)
        )) as ccxt.Ticker;
        this.updateLatency(Date.now() - start);
        this.lastMessageAt = Date.now();
        this.onTicker(ticker, this.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tickers = (this.ex as any).tickers as Record<string, unknown> | undefined;
        if (tickers) delete tickers[symbol];
        this.resetConsecutiveErrors(key);
      } catch (e) {
        this.logger.error({ symbol, err: e }, 'watchTicker error');
        this.handleStreamError(key, e);
        await this.reconnect();
      }
    }
    this.activeStreams.delete(key);
    this.stoppingStreams.delete(key);
  }

  async watchOHLCV(symbol: string, tf: string): Promise<void> {
    const key = `ohlcv:${symbol}:${tf}`;
    if (this.activeStreams.size >= MAX_STREAMS) {
      this.logger.warn({ id: this.id, size: this.activeStreams.size }, 'Max streams limit reached');
      return;
    }
    if (this.activeStreams.has(key) || this.stoppingStreams.has(key)) return;
    this.activeStreams.add(key);
    while (this.activeStreams.has(key) && !this.stoppingStreams.has(key)) {
      while (this.isReconnecting) {
        await new Promise<void>(resolve => setTimeout(resolve, 200));
      }
      const start = Date.now();
      try {
        const candles = (await this.cb.execute(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.ex as any).watchOHLCV(symbol, tf, undefined, CANDLES_LIMIT)
        )) as ccxt.OHLCV[];
        this.updateLatency(Date.now() - start);
        this.lastMessageAt = Date.now();
        for (const c of candles) this.onCandle(c, symbol, tf, this.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ohlcvs = (this.ex as any).ohlcvs as
          Record<string, Record<string, unknown[]>> | undefined;
        if (ohlcvs?.[symbol]?.[tf]) ohlcvs[symbol][tf].length = 0;
        this.resetConsecutiveErrors(key);
      } catch (e) {
        this.logger.error({ symbol, tf, err: e }, 'watchOHLCV error');
        this.handleStreamError(key, e);
        await this.reconnect();
      }
    }
    this.activeStreams.delete(key);
    this.stoppingStreams.delete(key);
  }

  stopSymbol(symbol: string): void {
    for (const key of [...this.activeStreams]) {
      if (key.includes(symbol)) {
        this.stoppingStreams.add(key);
        this.activeStreams.delete(key);
      }
    }
    this.logger.debug({ id: this.id, symbol }, 'stopSymbol');
  }

  stopAll(): void {
    for (const key of this.activeStreams) this.stoppingStreams.add(key);
    this.activeStreams.clear();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.ex as any)?.close?.();
    } catch { /* ignore */ }
  }

  streamCount(): number {
    return this.activeStreams.size;
  }

  getStats(): ConnectorStats {
    return {
      id: this.id,
      streamCount: this.activeStreams.size,
      latencyMs: this.latencyMs,
      lastMessageAt: this.lastMessageAt,
      restarts: this.restarts,
      circuitState: this.cb.getState(),
    };
  }
}
