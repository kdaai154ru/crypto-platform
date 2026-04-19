// cores/storage-core/src/valkey-store.ts
import Valkey from 'iovalkey';
export const TTL = {
  TICKER:       5,
  TRADE_LATEST: 1,
  TRADE_DELTA:  60,
  CANDLE:       60,
  INDICATOR:    60,
  SCREENER:     30,
  TOP20:        300,
  SYSTEM:       60,
  ETF:          3600,
  WHALE:        5,
} as const

export class ValkeyStore {
  constructor(private readonly client: Valkey) {}
  async setTicker(symbol:string, data:object): Promise<void> {
    await this.client.set(`ticker:${symbol}`, JSON.stringify(data), 'EX', TTL.TICKER)
  }
  async setIndicator(symbol:string, tf:string, name:string, data:object): Promise<void> {
    await this.client.set(`indicator:${symbol}:${tf}:${name}`, JSON.stringify(data), 'EX', TTL.INDICATOR)
  }
  async setScreener(name:string, tf:string, data:object): Promise<void> {
    await this.client.set(`screener:${name}:${tf}`, JSON.stringify(data), 'EX', TTL.SCREENER)
  }
  async get(key:string): Promise<string|null> { return this.client.get(key) }
}
