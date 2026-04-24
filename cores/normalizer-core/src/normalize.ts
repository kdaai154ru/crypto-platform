// cores/normalizer-core/src/normalize.ts
// FIX #27: zod-валидация входящих raw:* сообщений
// Без валидации невалидные данные от биржи молча публикуются дальше
import { z } from 'zod';
import type { NormalizedTrade, NormalizedCandle, NormalizedTicker, ExchangeId, Timeframe } from '@crypto-platform/types';

// ─── Схемы входящих raw данных ───────────────────────────────────────────────

const RawTradeSchema = z.object({
  symbol:    z.string().min(1),
  timestamp: z.number().positive(),
  amount:    z.number().nonnegative(),
  price:     z.number().positive(),
  side:      z.enum(['buy', 'sell']).optional(),
  exchange:  z.string().min(1),
}).passthrough();

const RawTickerSchema = z.object({
  symbol:  z.string().min(1),
  last:    z.number().positive().optional(),
  bid:     z.number().positive().optional(),
  ask:     z.number().positive().optional(),
  volume:  z.number().nonnegative().optional(),
  exchange: z.string().min(1),
}).passthrough();

const RawCandleSchema = z.object({
  symbol:   z.string().min(1),
  tf:       z.string().min(1),
  exchange: z.string().min(1),
  c: z.tuple([
    z.number(), // timestamp
    z.number(), // open
    z.number(), // high
    z.number(), // low
    z.number(), // close
    z.number(), // volume
  ]),
});

// ─── Нормализаторы ────────────────────────────────────────────────────────────

export function normalizeTrade(
  raw: unknown,
  exchange: ExchangeId
): NormalizedTrade | null {
  const parsed = RawTradeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;

  // FIX(audit): если side неизвестен — НЕ подставляем 'buy' по умолчанию.
  // Трейды с null side исключаются из расчёта CVD delta в trade-processor,
  // чтобы не искажать buy/sell объёмы.
  if (!d.side) return null;

  return {
    exchange,
    symbol:   d.symbol,
    price:    d.price,
    qty:      d.amount,
    side:     d.side,
    ts:       d.timestamp,
    usdValue: d.price * d.amount,
    isLarge:  d.price * d.amount > 100_000,
    sizeLabel: d.price * d.amount >= 1_000_000 ? 'XL'
             : d.price * d.amount >= 100_000   ? 'L'
             : d.price * d.amount >= 10_000    ? 'M'
             : 'S',
  };
}

export function normalizeTicker(
  raw: unknown,
  exchange: ExchangeId
): NormalizedTicker | null {
  const parsed = RawTickerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const bid = d.bid ?? 0;
  const ask = d.ask ?? 0;
  return {
    exchange,
    symbol:   d.symbol,
    last:     d.last ?? 0,
    bid,
    ask,
    spread:   ask > 0 && bid > 0 ? ask - bid : 0,
    vol24h:   d.volume ?? 0,
    change24h: 0,
    high24h:  0,
    low24h:   0,
    ts:       Date.now(),
  };
}

export function normalizeCandle(
  c: unknown,
  symbol: string,
  tf: Timeframe,
  exchange: ExchangeId
): NormalizedCandle | null {
  const row = z.tuple([
    z.number(), z.number(), z.number(), z.number(), z.number(), z.number(),
  ]).safeParse(c);
  if (!row.success) return null;
  const [ts, open, high, low, close, volume] = row.data;
  return {
    exchange,
    symbol,
    tf,
    ts,
    open,
    high,
    low,
    close,
    volume,
    buyVolume:  0,
    sellVolume: 0,
    isClosed:   false,
  };
}
