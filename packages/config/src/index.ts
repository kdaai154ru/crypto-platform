// packages/config/src/index.ts
import { z } from 'zod'

export const BaseSchema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info')
})

export const ValkeySchema = z.object({
  VALKEY_HOST: z.string().default('localhost'),
  VALKEY_PORT: z.coerce.number().default(6379)
})

export const RedisAuthSchema = z.object({
  VALKEY_PASSWORD: z.string().optional()
})

export const CHSchema = z.object({
  CLICKHOUSE_HOST: z.string().default('localhost'),
  CLICKHOUSE_PORT: z.coerce.number().default(8123),
  CLICKHOUSE_DB: z.string().default('crypto')
})

export const PGSchema = z.object({
  PG_HOST: z.string().default('localhost'),
  PG_PORT: z.coerce.number().default(5432),
  PG_USER: z.string().default('crypto'),
  PG_PASSWORD: z.string().default('secret'),
  PG_DB: z.string().default('crypto')
})

export const JwtSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long')
})

export const ExchangeSchema = z.object({
  EXCHANGE_LIST: z.string().default('binance,bybit,okx'),
  EXCHANGE_CCXT_VERSION: z.string().optional()
})

export function loadEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues.map(
      i => `  - ${i.path.join('.')}: ${i.message}`
    ).join('\n')
    console.error(`❌ Invalid environment variables:\n${issues}`)
    process.exit(1)
  }
  return result.data
}

export type InferEnv<T extends z.ZodTypeAny> = z.infer<T>