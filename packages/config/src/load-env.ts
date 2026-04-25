import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodTypeAny, output } from 'zod';

// Absolute path to the monorepo root — reliable regardless of cwd.
// packages/config/src/ → up 3 levels → repo root
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');

/**
 * Forcibly sets unknownKeys to 'strip' on any ZodObject-like schema by
 * directly mutating _def. This bypasses instanceof and typeName checks,
 * both of which fail when the zod package is loaded from more than one
 * path in the module graph (e.g. PM2 CJS fork loading a compiled ESM pkg).
 *
 * Zod v3: ZodObject._def.unknownKeys is 'strip' | 'strict' | 'passthrough'.
 * .merge() inherits the unknownKeys of the RIGHT operand, so a chain like
 *   BaseSchema.merge(A).merge(B).merge(C)
 * ends up with C's unknownKeys. If any operand was built with .strict()
 * the result silently becomes strict — every unknown key → "Expected never".
 *
 * Returns the original schema reference (mutation is in-place).
 */
function forceStrip<T extends ZodTypeAny>(schema: T): T {
  const def = (schema as unknown as Record<string, unknown>)['_def'];
  if (def !== null && typeof def === 'object') {
    (def as Record<string, unknown>)['unknownKeys'] = 'strip';
  }
  return schema;
}

/**
 * Loads .env from the monorepo root, then validates process.env against
 * a Zod schema. Uses override:true so the file always wins over whatever
 * PM2 / shell happened to inject — prevents stale env from a previous
 * `pm2 start` without --update-env.
 *
 * Unknown keys (PM2 internals, Windows env vars, other services' vars
 * present in the shared .env) are always stripped before validation
 * regardless of how the schema was built.
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

  // Force strip mode by directly mutating _def.unknownKeys.
  // Avoids all instanceof / typeName fragility across module boundaries.
  const safeSchema = forceStrip(schema);

  const result = safeSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] Environment validation failed:\n${issues}`);
  }

  return result.data as output<T>;
}
