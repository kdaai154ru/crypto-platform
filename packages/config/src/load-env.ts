import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { AnyZodObject, output } from 'zod';

// Absolute path to the monorepo root — reliable regardless of cwd.
// packages/config/src/ → up 3 levels → repo root
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/**
 * Loads .env from the monorepo root, then validates process.env against
 * a Zod schema. Uses override:true so the file always wins over whatever
 * PM2 / shell injected — prevents stale env from a previous pm2 start.
 *
 * Unknown keys (PM2 internals, Windows env vars, other services' vars
 * present in the shared .env) are silently ignored via passthrough.
 *
 * Uses z.object({}).passthrough().merge(schema) instead of mutating _def.
 * This is the only approach guaranteed to work across:
 *   — ESM vs CJS module boundaries
 *   — multiple zod instances in the module graph
 *   — .merge() chains that inherit unknownKeys from the rightmost operand
 *
 * Usage:
 *   const env = loadEnv(BaseSchema.merge(ValkeySchema));
 */
export function loadEnv<T extends AnyZodObject>(schema: T): output<T> {
  // Primary: absolute path resolved from this file's location
  loadDotenv({ path: resolve(REPO_ROOT, '.env'), override: true });
  // Fallback: relative to cwd (handles tsx watch from package dir)
  loadDotenv({ path: resolve(process.cwd(), '.env'), override: false });
  loadDotenv({ path: resolve(process.cwd(), '../../.env'), override: false });

  // Wrap in a passthrough base so unknown keys (PM2 internals, Windows vars,
  // other services' vars from the shared .env) are silently accepted.
  // .merge(schema) overlays the per-service field definitions on top.
  const tolerantSchema = z.object({}).passthrough().merge(schema);

  const result = tolerantSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] Environment validation failed:\n${issues}`);
  }

  return result.data as output<T>;
}

