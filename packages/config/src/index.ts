// packages/config/src/index.ts
import { z } from 'zod'
export const BaseSchema    = z.object({ NODE_ENV:z.string().default('development'), LOG_LEVEL:z.string().default('info') })
export const ValkeySchema  = z.object({ VALKEY_HOST:z.string().default('localhost'), VALKEY_PORT:z.coerce.number().default(6379) })
export const CHSchema      = z.object({ CLICKHOUSE_HOST:z.string().default('localhost'), CLICKHOUSE_PORT:z.coerce.number().default(8123), CLICKHOUSE_DB:z.string().default('crypto') })
export const PGSchema      = z.object({ PG_HOST:z.string().default('localhost'), PG_PORT:z.coerce.number().default(5432), PG_USER:z.string().default('crypto'), PG_PASSWORD:z.string().default('secret'), PG_DB:z.string().default('crypto') })
export function loadEnv<T extends z.ZodTypeAny>(schema:T):z.infer<T> { return schema.parse(process.env) }
