// packages/utils/src/valkey-client.ts
//
// Central factory for iovalkey connections.
// Reads VALKEY_HOST / VALKEY_PORT / VALKEY_PASSWORD from process.env so every
// service automatically authenticates when VALKEY_PASSWORD is set — no need to
// repeat the password wiring in every main.ts.
import Valkey from 'iovalkey';
import type { RedisOptions } from 'iovalkey';

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
export function createValkeyClient(opts: ValkeyClientOptions = {}): InstanceType<typeof Valkey> {
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

  return new Valkey({ ...baseOpts, ...opts.extra });
}
