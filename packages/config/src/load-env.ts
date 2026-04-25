import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodTypeAny, AnyZodObject, output } from 'zod';

// Absolute path to the monorepo root — reliable regardless of cwd.
// packages/config/src/ → up 3 levels → repo root
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');

/**
 * Returns true for any ZodObject (including results of .merge(), .extend(),
 * .partial(), etc.) without relying on instanceof — which breaks when the
 * zod package is loaded from more than one path in the module graph
 * (e.g. PM2 CJS fork loading a compiled ESM package).
 *
 * We cast through `unknown` first to satisfy TS — ZodTypeAny has no index
 * signature so a direct cast to Record<string, unknown> is rejected (TS2352).
 */
function isZodObject(schema: ZodTypeAny): schema is AnyZodObject {
  const s = schema as unknown as Record<string, unknown>;
  const def = s['_def'] as Record<string, unknown> | undefined;
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof def === 'object' &&
    def !== null &&
    def['typeName'] === 'ZodObject'
  );
}

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
  const safeSchema = isZodObject(schema) ? schema.strip() : schema;

  const result = safeSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] Environment validation failed:\n${issues}`);
  }

  return result.data as output<T>;
}
