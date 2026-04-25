// cores/trades-core/src/clickhouse-writer.ts
import { createClient } from '@clickhouse/client'
import type { NormalizedTrade } from '@crypto-platform/types'
import type { Logger } from '@crypto-platform/logger'

export class ClickHouseTradesWriter {
  private client

  constructor(
    private readonly log: Logger,
    host: string,
    port: number,
    db: string,
    username = 'default',
    password = '',
  ) {
    this.client = createClient({
      url: `http://${host}:${port}`,
      database: db,
      username,
      password,
      request_timeout: 30_000,
    })
  }

  async writeBatch(trades: NormalizedTrade[]): Promise<void> {
    if (!trades.length) return
    await this.client.insert({
      table: 'trades',
      values: trades.map(t => ({
        symbol:    t.symbol,
        exchange:  t.exchange,
        ts:        new Date(t.ts).toISOString(),
        side:      t.side,
        price:     t.price,
        qty:       t.qty,
        usd_value: t.usdValue,
        is_large:  t.isLarge ? 1 : 0,
      })),
      format: 'JSONEachRow',
    })
    this.log.debug({ count: trades.length }, 'trades written to ClickHouse')
  }
}
