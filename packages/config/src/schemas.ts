import { z } from 'zod';

// ─── Base ──────────────────────────────────────────────────────────────────────
export const BaseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

// ─── Valkey / Redis ────────────────────────────────────────────────────────────
export const ValkeySchema = z.object({
  VALKEY_HOST: z.string().default('127.0.0.1'),
  VALKEY_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
});

// ─── JWT ───────────────────────────────────────────────────────────────────────
export const JwtSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('crypto-platform'),
});

// ─── ClickHouse ────────────────────────────────────────────────────────────────
export const CHSchema = z.object({
  CH_HOST:     z.string().default('127.0.0.1'),
  CH_PORT:     z.coerce.number().int().min(1).max(65535).default(8123),
  CH_DATABASE: z.string().default('crypto'),
  CH_USERNAME: z.string().default('default'),
  CH_PASSWORD: z.string().default(''),
});
