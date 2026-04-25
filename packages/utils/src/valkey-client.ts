// packages/utils/src/valkey-client.ts
//
// Central factory for iovalkey connections.
// Reads VALKEY_HOST / VALKEY_PORT / VALKEY_PASSWORD from process.env so every
// service automatically authenticates when VALKEY_PASSWORD is set — no need to
// repeat the password wiring in every main.ts.
//
// iovalkey@0.3.x ships a CommonJS bundle — `module.exports = class Valkey`.
// In an ESM context tsc resolves that as a namespace with the class on .default.
// We normalise both shapes so the code works whether tsc targets ESM or CJS.
import * as ValkeyNs from 'iovalkey';
import type { RedisOptions, Redis as ValkeyInstance } from 'iovalkey';

// Resolve the actual constructor regardless of interop mode.
// ESM with esModuleInterop: ValkeyNs.default is the class.
// CJS require():           ValkeyNs itself is the class.
const ValkeyClass = (
  (ValkeyNs as unknown as { default?: unknown }).default ?? ValkeyNs
) as new (opts: RedisOptions) => ValkeyInstance;

export type { ValkeyInstance };

export interface ValkeyClientOptions {
  /** Extra iovalkey options merged on top of defaults. */
  extra?: Partial<RedisOptions>;
  /** Human-readable label used only for error log prefix. */
  label?: string;
}

/**
 * Create an authenticated iovalkey client using env vars.
 *
 * Required env vars (read from process.env):
 *   VALKEY_HOST     — default '127.0.0.1'
 *   VALKEY_PORT     — default 6379
 *   VALKEY_PASSWORD — optional; omitted when empty string
 */
export function createValkeyClient(opts: ValkeyClientOptions = {}): ValkeyInstance {
  const host     = process.env['VALKEY_HOST']     ?? '127.0.0.1';
  const port     = parseInt(process.env['VALKEY_PORT'] ?? '6379', 10);
  const password = process.env['VALKEY_PASSWORD'] ?? '';

  const baseOpts: RedisOptions = {
    host,
    port,
    ...(password ? { password } : {}),
    retryStrategy: (times: number) => Math.min(times * 100, 3_000),
    keepAlive: 10_000,
    enableOfflineQueue: true,
    lazyConnect: false,
  };

  return new ValkeyClass({ ...baseOpts, ...opts.extra });
}
