// apps/ws-gateway/src/main.ts
import { createLogger } from '@crypto-platform/logger'
import { loadEnv, BaseSchema, ValkeySchema } from '@crypto-platform/config'
import { z } from 'zod'
import Valkey from 'iovalkey';
import uWS from 'uWebSockets.js'
import { nanoid } from 'nanoid';
import { ConnectionManager } from './connection-manager.js'
import { SubscriptionHandler } from './subscription-handler.js'
import { ValkeyFanout } from './valkey-fanout.js'

const env = loadEnv(BaseSchema.merge(ValkeySchema).merge(z.object({ WS_PORT: z.coerce.number().default(4000) })))
const log = createLogger('ws-gateway')
const valkeyPub = new Valkey({ host:env.VALKEY_HOST, port:env.VALKEY_PORT })
const cm      = new ConnectionManager()
const subHdlr = new SubscriptionHandler(cm, valkeyPub, log)
const fanout  = new ValkeyFanout({ host:env.VALKEY_HOST, port:env.VALKEY_PORT }, cm, log)

uWS.App().ws('/*', {
  idleTimeout: 120,
  open(ws) {
    const id = (crypto as typeof import('crypto')).randomUUID()
    ;(ws as any).__id = id
    cm.add(id, { send:(m:string)=>ws.send(m) })
    ws.send(JSON.stringify({ type:'welcome', clientId:id }))
  },
  message(ws, msg) {
    try {
      const { type, channels, symbol } = JSON.parse(Buffer.from(msg).toString())
      const id = (ws as any).__id as string
      if (type==='subscribe')   subHdlr.subscribe(id, channels, symbol)
      if (type==='unsubscribe') subHdlr.unsubscribe(id, channels, symbol)
    } catch {}
  },
  close(ws) {
    const id = (ws as any).__id as string
    subHdlr.unsubscribeAll(id)
    cm.remove(id)
  }
}).listen(env.WS_PORT, tok => {
  if (tok) log.info({ port:env.WS_PORT }, 'ws-gateway started')
  else { log.fatal('ws-gateway failed to start'); process.exit(1) }
})

// heartbeat
const hb = new Valkey({ host:env.VALKEY_HOST, port:env.VALKEY_PORT })
setInterval(()=>{
  hb.set('heartbeat:ws-gateway', Date.now().toString(), 'EX', 30)
  hb.set('stat:active_clients', cm.count().toString(), 'EX', 30)
}, 5_000)
process.on('SIGTERM',()=>{ fanout.close(); valkeyPub.quit(); hb.quit(); process.exit(0) })
