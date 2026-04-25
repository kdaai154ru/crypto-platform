import { z } from 'zod';

// ─── Base ─────────────────────────────────────────────────────────────────────────────────
export const BaseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

// ─── Valkey / Redis ──────────────────────────────────────────────────────────────────────────
export const ValkeySchema = z.object({
  VALKEY_HOST:     z.string().default('127.0.0.1'),
  VALKEY_PORT:     z.coerce.number().int().min(1).max(65535).default(6379),
  // FIX: added VALKEY_PASSWORD — was missing, causing all iovalkey connections
  // to fail with NOAUTH after Valkey was re-created with requirepass.
  VALKEY_PASSWORD: z.string().default(''),
});

// ─── JWT ────────────────────────────────────────────────────────────────────────────────────
export const JwtSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('crypto-platform'),
});

// ─── ClickHouse ──────────────────────────────────────────────────────────────────────────────
export const CHSchema = z.object({
  // FIX: renamed from CH_* to CLICKHOUSE_* to match actual .env variable names.
  // Previous mismatch caused zod to fall back to default(8123) instead of
  // reading CLICKHOUSE_PORT=18123, resulting in ECONNREFUSED 127.0.0.1:8123.
  CLICKHOUSE_HOST:     z.string().default('127.0.0.1'),
  CLICKHOUSE_PORT:     z.coerce.number().int().min(1).max(65535).default(8123),
  CLICKHOUSE_DB:       z.string().default('crypto'),
  CLICKHOUSE_USER:     z.string().default('default'),
  CLICKHOUSE_PASSWORD: z.string().default(''),
});
