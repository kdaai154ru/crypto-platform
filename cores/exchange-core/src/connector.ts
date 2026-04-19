// cores/exchange-core/src/connector.ts
import ccxt from 'ccxt';
import type { ExchangeId } from '@crypto-platform/types';
import type { Logger } from '@crypto-platform/logger';
import { CircuitBreaker } from '@crypto-platform/utils';
import { ReconnectManager } from './reconnect-manager.js';
import { RateLimiter } from './rate-limiter.js';

export type TradeCallback = (trade: any, exchange: ExchangeId) => void;
export type TickerCallback = (ticker: any, exchange: ExchangeId) => void;
export type CandleCallback = (candle: any, symbol: string, tf: string, exchange: ExchangeId) => void;

const TRADES_LIMIT = 50;
const CANDLES_LIMIT = 10;

export class ExchangeConnector {
  private ex!: any;
  private cb: CircuitBreaker;
  private rm: ReconnectManager;
  private rl: RateLimiter;
  private activeStreams = new Set<string>();
  public latencyMs = 0;
  public lastMessageAt = 0;
  public restarts = 0;

  constructor(
    public readonly id: ExchangeId,
    private readonly logger: Logger,
    private readonly onTrade: TradeCallback,
    private readonly onTicker: TickerCallback,
    private readonly onCandle: CandleCallback,
  ) {
    this.cb = new CircuitBreaker(id);
    this.rm = new ReconnectManager(id, logger);
    this.rl = new RateLimiter(10);
  }

  async connect(): Promise<void> {
    // Закрываем старое соединение перед переподключением
    if (this.ex) {
      try { await this.ex.close(); } catch {}
      this.ex = null;
    }
    const pro = (ccxt as any).pro as Record<string, new (o?: object) => any>;
    const ExClass = pro[this.id as string];
    if (!ExClass) throw new Error(`Unknown exchange: ${this.id}`);
    this.ex = new ExClass({
      enableRateLimit: true,
      timeout: 30_000,
      newUpdates: true, // только новые обновления, не весь буфер
    });
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
        // Очищаем внутренний буфер ccxt
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
        const ticker = await this.cb.execute(
          () => this.ex.watchTicker(symbol)
        );
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
        // Очищаем внутренний буфер ccxt
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

  stopStream(key: string) { this.activeStreams.delete(key); }

  /**
   * Останавливает все стримы для конкретного символа.
   * Удаляет из activeStreams ключи вида:
   *   ticker:BTC/USDT, trades:BTC/USDT, ohlcv:BTC/USDT:1m, ...
   */
  stopSymbol(symbol: string): void {
    for (const key of this.activeStreams) {
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
