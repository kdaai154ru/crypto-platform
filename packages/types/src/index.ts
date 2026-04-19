// packages/types/src/index.ts

// Базовые типы по биржам
export type {
  ExchangeId,
  Timeframe,
  ExchangeStatus,
  ExchangeState,
} from './exchange.js';

// Нормализованные данные рынка (trade/ticker/candle/funding/OI/liquidations)
export * from './normalized.js';

// Остальные доменные типы
export * from './widget.js';
export * from './system.js';
export * from './alert.js';
export * from './screener.js';
export * from './indicator.js';

// ВАЖНО: НЕТ export * from './derivatives.js';
// чтобы не было дублирующихся NormalizedFunding/NormalizedOI/NormalizedLiquidation