// cores/exchange-core/tests/connector.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExchangeConnector } from '../src/connector.js';
import type { Logger } from '@crypto-platform/logger';
import {
  exchangeRequestsCounter,
  exchangeLatencyHistogram,
  exchangeErrorsCounter,
  circuitBreakerStateGauge,
} from '@crypto-platform/metrics';

// Мокаем метрики
vi.mock('@crypto-platform/metrics', () => ({
  exchangeRequestsCounter: {
    inc: vi.fn(),
  },
  exchangeLatencyHistogram: {
    observe: vi.fn(),
  },
  exchangeErrorsCounter: {
    inc: vi.fn(),
  },
  circuitBreakerStateGauge: {
    set: vi.fn(),
  },
}));

// Мокаем CircuitBreaker из utils
vi.mock('@crypto-platform/utils', () => ({
  CircuitBreaker: vi.fn().mockImplementation(() => ({
    execute: vi.fn(),
    open: vi.fn(),
    getState: vi.fn().mockReturnValue('CLOSED'),
  })),
}));

// Мокаем ReconnectManager и RateLimiter
vi.mock('../src/reconnect-manager.js', () => ({
  ReconnectManager: vi.fn().mockImplementation(() => ({
    schedule: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../src/rate-limiter.js', () => ({
  RateLimiter: vi.fn().mockImplementation(() => ({
    throttle: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Мокаем ccxt.pro
const mockWatchTicker = vi.fn();
const mockWatchTrades = vi.fn();
const mockWatchOHLCV = vi.fn();
const mockExchangeClass = vi.fn().mockImplementation(() => ({
  watchTicker: mockWatchTicker,
  watchTrades: mockWatchTrades,
  watchOHLCV: mockWatchOHLCV,
  close: vi.fn(),
}));

vi.mock('ccxt', () => ({
  default: {},
  pro: {
    binance: mockExchangeClass,
    bybit: mockExchangeClass,
    okx: mockExchangeClass,
  },
}));

describe('ExchangeConnector', () => {
  let connector: ExchangeConnector;
  let mockLogger: Logger;
  let mockOnTrade: any;
  let mockOnTicker: any;
  let mockOnCandle: any;
  let mockCircuitBreaker: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;
    mockOnTrade = vi.fn();
    mockOnTicker = vi.fn();
    mockOnCandle = vi.fn();

    // Сбрасываем моки метрик
    vi.mocked(exchangeRequestsCounter.inc).mockClear();
    vi.mocked(exchangeLatencyHistogram.observe).mockClear();
    vi.mocked(exchangeErrorsCounter.inc).mockClear();
    vi.mocked(circuitBreakerStateGauge.set).mockClear();

    // Создаём коннектор
    connector = new ExchangeConnector(
      'binance',
      mockLogger,
      mockOnTrade,
      mockOnTicker,
      mockOnCandle
    );

    // Получаем доступ к CircuitBreaker для тестов
    const CircuitBreaker = vi.mocked(await import('@crypto-platform/utils')).CircuitBreaker;
    mockCircuitBreaker = (CircuitBreaker as any).mock.results[0]?.value;

    // Сбрасываем моки watch методов
    mockWatchTicker.mockReset();
    mockWatchTrades.mockReset();
    mockWatchOHLCV.mockReset();
  });

  afterEach(() => {
    connector.stopAll();
    vi.useRealTimers();
  });

  describe('успешный fetchTicker', () => {
    it('инкрементирует метрику crypto_exchange_requests_total со status=success', async () => {
      const mockTicker = { symbol: 'BTC/USDT', last: 50000 };
      mockWatchTicker.mockResolvedValue(mockTicker);
      mockCircuitBreaker.execute.mockResolvedValue(mockTicker);

      const promise = connector.watchTicker('BTC/USDT');
      await vi.advanceTimersByTimeAsync(0);
      // Ждём завершения итерации цикла
      connector.stopSymbol('BTC/USDT');
      await promise;

      expect(exchangeRequestsCounter.inc).toHaveBeenCalledWith({
        exchange: 'binance',
        method: 'watchTicker',
        status: 'success',
      });
    });

    it('замеряет latency и пишет в histogram', async () => {
      const mockTicker = { symbol: 'BTC/USDT', last: 50000 };
      mockWatchTicker.mockResolvedValue(mockTicker);
      mockCircuitBreaker.execute.mockResolvedValue(mockTicker);

      const promise = connector.watchTicker('BTC/USDT');
      await vi.advanceTimersByTimeAsync(50);
      connector.stopSymbol('BTC/USDT');
      await promise;

      expect(exchangeLatencyHistogram.observe).toHaveBeenCalledWith(
        { exchange: 'binance', method: 'watchTicker' },
        expect.any(Number)
      );
    });

    it('вызывает onTicker с данными', async () => {
      const mockTicker = { symbol: 'BTC/USDT', last: 50000 };
      mockWatchTicker.mockResolvedValue(mockTicker);
      mockCircuitBreaker.execute.mockResolvedValue(mockTicker);

      const promise = connector.watchTicker('BTC/USDT');
      await vi.advanceTimersByTimeAsync(0);
      connector.stopSymbol('BTC/USDT');
      await promise;

      expect(mockOnTicker).toHaveBeenCalledWith(mockTicker, 'binance');
    });
  });

  describe('ошибка fetchTicker', () => {
    it('инкрементирует метрики со status=error и error_type', async () => {
      const error = new Error('Network error');
      mockWatchTicker.mockRejectedValue(error);
      mockCircuitBreaker.execute.mockRejectedValue(error);

      const promise = connector.watchTicker('BTC/USDT');
      await vi.advanceTimersByTimeAsync(0);
      connector.stopSymbol('BTC/USDT');
      await promise;

      expect(exchangeRequestsCounter.inc).toHaveBeenCalledWith({
        exchange: 'binance',
        method: 'watchTicker',
        status: 'error',
      });
      expect(exchangeErrorsCounter.inc).toHaveBeenCalledWith({
        exchange: 'binance',
        error_type: 'Network error',
      });
    });

    it('увеличивает restarts', async () => {
      const error = new Error('Connection lost');
      mockWatchTicker.mockRejectedValue(error);
      mockCircuitBreaker.execute.mockRejectedValue(error);

      const initialRestarts = connector.restarts;
      const promise = connector.watchTicker('BTC/USDT');
      await vi.advanceTimersByTimeAsync(0);
      connector.stopSymbol('BTC/USDT');
      await promise;

      expect(connector.restarts).toBe(initialRestarts + 1);
    });
  });

  describe('circuit breaker', () => {
    it('при состоянии OPEN запрос не делается, бросается ошибка', async () => {
      mockCircuitBreaker.getState.mockReturnValue('OPEN');
      mockCircuitBreaker.execute.mockImplementation(() => {
        throw new Error('Circuit breaker is open');
      });

      const promise = connector.watchTicker('BTC/USDT');
      await vi.advanceTimersByTimeAsync(0);
      connector.stopSymbol('BTC/USDT');
      await promise;

      expect(mockWatchTicker).not.toHaveBeenCalled();
      expect(exchangeRequestsCounter.inc).toHaveBeenCalledWith({
        exchange: 'binance',
        method: 'watchTicker',
        status: 'error',
      });
      expect(exchangeErrorsCounter.inc).toHaveBeenCalledWith({
        exchange: 'binance',
        error_type: 'Circuit breaker is open',
      });
    });
  });

  describe('watchTrades', () => {
    it('инкрементирует метрики и вызывает onTrade', async () => {
      const mockTrades = [{ id: '1', price: 50000, amount: 0.1 }];
      mockWatchTrades.mockResolvedValue(mockTrades);
      mockCircuitBreaker.execute.mockResolvedValue(mockTrades);

      const promise = connector.watchTrades('BTC/USDT');
      await vi.advanceTimersByTimeAsync(0);
      connector.stopSymbol('BTC/USDT');
      await promise;

      expect(exchangeRequestsCounter.inc).toHaveBeenCalledWith({
        exchange: 'binance',
        method: 'watchTrades',
        status: 'success',
      });
      expect(mockOnTrade).toHaveBeenCalledWith(mockTrades[0], 'binance');
    });
  });

  describe('watchOHLCV', () => {
    it('инкрементирует метрики и вызывает onCandle', async () => {
      const mockCandles = [[1700000000, 50000, 51000, 49000, 50500, 100]];
      mockWatchOHLCV.mockResolvedValue(mockCandles);
      mockCircuitBreaker.execute.mockResolvedValue(mockCandles);

      const promise = connector.watchOHLCV('BTC/USDT', '1m');
      await vi.advanceTimersByTimeAsync(0);
      connector.stopSymbol('BTC/USDT');
      await promise;

      expect(exchangeRequestsCounter.inc).toHaveBeenCalledWith({
        exchange: 'binance',
        method: 'watchOHLCV',
        status: 'success',
      });
      expect(mockOnCandle).toHaveBeenCalledWith(mockCandles[0], 'BTC/USDT', '1m', 'binance');
    });
  });
});