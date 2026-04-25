import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, type ZodTypeAny, type output } from 'zod';

// Absolute path to the monorepo root — reliable regardless of cwd.
// packages/config/src/ → up 3 levels → repo root
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');

/**
 * Loads .env from the monorepo root, then validates process.env against
 * a Zod schema. Uses override:true so the file always wins over whatever
 * PM2 / shell happened to inject — prevents stale env from a previous
 * `pm2 start` without --update-env.
 *
 * Unknown keys (PM2 internals, Windows env vars, etc.) are always stripped
 * before validation regardless of how the schema was built.
 *
 * Usage:
 *   const env = loadEnv(BaseSchema.merge(ValkeySchema));
 */
export function loadEnv<T extends ZodTypeAny>(schema: T): output<T> {
  // Primary: absolute path resolved from this file's location
  loadDotenv({ path: resolve(REPO_ROOT, '.env'), override: true });
  // Fallback: relative to cwd (handles edge cases like tsx watch from package dir)
  loadDotenv({ path: resolve(process.cwd(), '.env'), override: false });
  loadDotenv({ path: resolve(process.cwd(), '../../.env'), override: false });

  // PM2 injects 100+ internal keys into process.env on every fork
  // (pm_id, axm_actions, autorestart, APPDATA, COMPUTERNAME, …).
  // Force strip mode so unknown keys are silently dropped regardless
  // of whether the schema was built with .strict() / .passthrough() / .merge().
  const safeSchema = schema instanceof z.ZodObject
    ? (schema as z.AnyZodObject).strip()
    : schema;

  const result = safeSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] Environment validation failed:\n${issues}`);
  }

  return result.data as output<T>;
}
