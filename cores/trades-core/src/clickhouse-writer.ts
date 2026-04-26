// cores/trades-core/src/clickhouse-writer.ts
import { createClient } from '@clickhouse/client'
import type { NormalizedTrade } from '@crypto-platform/types'
import type { Logger } from '@crypto-platform/logger'

/** Convert ISO string or timestamp to ClickHouse DateTime64 format: "YYYY-MM-DD HH:mm:ss.SSS" */
function toChDateTime(ts: string | number): string {
  return new Date(ts).toISOString().replace('T', ' ').replace('Z', '')
}

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
    const encodedUser = encodeURIComponent(username);
    const encodedPass = encodeURIComponent(password);
    const url = password
      ? `http://${encodedUser}:${encodedPass}@${host}:${port}`
      : `http://${host}:${port}`;

    this.client = createClient({
      url,
      database: db,
      username,
      password,
      request_timeout: 30_000,
    })
    this.log.debug({ host, port, db, username }, 'ClickHouse client created')
  }

  async writeBatch(trades: NormalizedTrade[]): Promise<void> {
    if (!trades.length) return
    await this.client.insert({
      table: 'trades',
      values: trades.map(t => ({
        symbol:    t.symbol,
        exchange:  t.exchange,
        ts:        toChDateTime(t.ts),
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
