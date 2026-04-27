// packages/types/src/module.ts
// DEPRECATED: используй импорт из './system.js' вместо этого файла.
// Оставлен для обратной совместимости — всё реэкспортируется из system.ts.
export type {
  ModuleStatus,
  ModuleState,
  PublicModuleState,
  SystemStatusPayload,
} from './system.js';

// ExchangeState остаётся в exchange.ts — реэкспорт для старых импортов
export type { ExchangeState, ExchangeStatus } from './exchange.js';
