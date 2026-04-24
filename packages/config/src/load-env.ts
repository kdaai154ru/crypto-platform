import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import type { ZodTypeAny, output } from 'zod';

/**
 * Loads .env from the nearest ancestor directory, then validates
 * process.env against a Zod schema.  Throws with a human-readable
 * message on the first validation failure so the process never
 * starts with a broken configuration.
 *
 * Usage:
 *   const env = loadEnv(BaseSchema.merge(ValkeySchema));
 */
export function loadEnv<T extends ZodTypeAny>(schema: T): output<T> {
  // Walk up from cwd to find .env; dotenv is a no-op if file not found.
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
