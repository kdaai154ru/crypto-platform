declare module '@clickhouse/client' {
  export interface ClickHouseClientConfigOptions {
    url?: string
    database?: string
    request_timeout?: number
    username?: string
    password?: string
    [key: string]: unknown
  }

  export interface InsertParams<T = unknown> {
    table: string
    values: T[]
    format?: string
  }

  export interface ClickHouseClient {
    insert<T = unknown>(params: InsertParams<T>): Promise<void>
    query(params: { query: string; format?: string }): Promise<{ json<R>(): Promise<R> }>
    close(): Promise<void>
  }

  export function createClient(config?: ClickHouseClientConfigOptions): ClickHouseClient
}
