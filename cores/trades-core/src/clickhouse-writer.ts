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
    // @clickhouse/client >=1.x accepts credentials either via top-level
    // username/password fields OR embedded in the URL as userinfo.
    // Some versions require the URL form when password contains special chars.
    // We use the explicit fields (spec-compliant) and also embed in URL as
    // a fallback so the HTTP Authorization header is always sent correctly.
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
