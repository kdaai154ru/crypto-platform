// cores/storage-core/src/valkey-keys.ts
export const ValkeyKeys = {
  ticker:       (symbol: string, exchange: string) => `ticker:${symbol}:${exchange}`,
  candle:       (symbol: string, exchange: string, tf: string) => `candle:${symbol}:${exchange}:${tf}`,
  oi:           (symbol: string, exchange: string) => `oi:${symbol}:${exchange}`,
  funding:      (symbol: string, exchange: string) => `funding:${symbol}:${exchange}`,
  liquidation:  (symbol: string) => `liq:${symbol}`,
  screener:     (type: string, tf: string) => `screener:${type}:${tf}`,
  heartbeat:    (module: string) => `heartbeat:${module}`,
  systemStatus: () => 'system:status:modules',
  top20:        (metric: string) => `top20:${metric}`,
  whale:        () => 'whale:recent',
  etf:          (name: string) => `etf:${name}`,
} as const
