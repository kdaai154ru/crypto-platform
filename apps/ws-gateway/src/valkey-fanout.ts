// apps/ws-gateway/src/valkey-fanout.ts
import Valkey from 'iovalkey'
import type { ConnectionManager } from './connection-manager.js'
import type { Logger } from '@crypto-platform/logger'

const CHANNEL_MAP: Record<string, (data: Record<string, unknown>) => string> = {
  'agg:ticker':      d => `ticker:${d['symbol']}`,
  'agg:candle':      d => `ohlcv:${d['symbol']}:${d['tf']}`,
  'trades:stream':   d => `trades:${d['symbol']}`,
  'trades:large':    _ => 'trades:large',
  'trades:delta':    d => `trades:delta:${d['symbol']}`,
  'deriv:oi':        d => `oi:${d['symbol']}`,
  'deriv:fund':      d => `funding:${d['symbol']}`,
  'deriv:liq':       _ => 'liquidations',
  'whale:event':     _ => 'whale:feed',
  'screener:update': _ => 'screener:update',
  'options:update':  _ => 'options:update',
  'etf:latest':      _ => 'etf:latest',
  'system:status':   _ => 'system:status',
}

export class ValkeyFanout {
  private sub: Valkey
  constructor(
    valkeyOpts: { host: string; port: number },
    private readonly cm: ConnectionManager,
    private readonly log: Logger
  ) {
    this.sub = new Valkey(valkeyOpts)
    this.sub.subscribe(...Object.keys(CHANNEL_MAP), (err: unknown) => { if (err) this.log.error(err) })
    this.sub.on('message', this.onMessage.bind(this))
  }

  private onMessage(channel: string, msg: string): void {
    try {
      const data = JSON.parse(msg)
      const getChannel = CHANNEL_MAP[channel]
      if (!getChannel) return
      const wsChannel = getChannel(data)
      const clients = this.cm.getByChannel(wsChannel)
      if (!clients.length) return
      const out = JSON.stringify({ channel: wsChannel, data })
      for (const c of clients) {
        try { (c.ws as { send: (m: string) => void }).send(out) }
        catch { this.cm.remove(c.id) }
      }
    } catch (e) { this.log.error(e) }
  }

  close(): void { this.sub.quit() }
}
