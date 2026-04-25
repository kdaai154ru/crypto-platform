import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodTypeAny, output } from 'zod';

// Absolute path to the monorepo root — reliable regardless of cwd.
// packages/config/src/ → up 3 levels → repo root
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');

/**
 * Loads .env from the monorepo root, then validates process.env against
 * a Zod schema. Uses override:true so the file always wins over whatever
 * PM2 / shell happened to inject — prevents stale env from a previous
 * `pm2 start` without --update-env.
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

  const result = schema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] Environment validation failed:\n${issues}`);
  }

  return result.data as output<T>;
}
