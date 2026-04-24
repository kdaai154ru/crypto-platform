// cores/storage-core/src/main.ts
import { createLogger } from '@crypto-platform/logger';
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config';
import Valkey from 'iovalkey';
import { ValkeyStore } from './valkey-store.js';

const env = loadEnv(BaseSchema.merge(ValkeySchema));
const log = createLogger('storage-core');

const VALKEY_OPTS = {
  host: env.VALKEY_HOST,
  port: env.VALKEY_PORT,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  keepAlive: 10000,
  enableOfflineQueue: true,
};

const client = new Valkey(VALKEY_OPTS);
const hb     = new Valkey(VALKEY_OPTS);
const sub    = new Valkey(VALKEY_OPTS);

client.on('error', (e: Error) => log.warn({ err: e.message }, 'client connection error'));
hb.on('error',     (e: Error) => log.warn({ err: e.message }, 'hb connection error'));
sub.on('error',    (e: Error) => log.warn({ err: e.message }, 'sub connection error'));

const store = new ValkeyStore(client);

sub.subscribe('agg:ticker', 'agg:candle', (e: unknown) => { if (e) log.error(e); });

sub.on('message', (ch: string, msg: string) => {
  try {
    const d = JSON.parse(msg);
    if (ch === 'agg:ticker') {
      store.setTicker(d.symbol, d).catch((e: unknown) => log.error(e, 'setTicker failed'));
    } else if (ch === 'agg:candle') {
      // FIX: agg:candle принимался но не сохранялся — добавлена запись в Valkey
      const exchange = d.exchange ?? 'unknown';
      const symbol   = d.symbol   ?? 'unknown';
      const tf       = d.tf       ?? '1m';
      store.setCandle(exchange, symbol, tf, d).catch((e: unknown) => log.error(e, 'setCandle failed'));
    }
  } catch (e) { log.error(e); }
});

const hbInterval = setInterval(
  () => hb.set('heartbeat:storage-core', Date.now().toString(), 'EX', 30),
  5_000
);

const shutdown = () => {
  clearInterval(hbInterval);
  client.quit();
  hb.quit();
  sub.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
log.info('storage-core started');
