// tests/load/ws-load.js
// Run: k6 run tests/load/ws-load.js
import ws from 'k6/ws'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

const msgReceived = new Counter('ws_messages_received')
const connRate    = new Rate('ws_connect_success')
const latency     = new Trend('ws_message_latency_ms')

export const options = {
  stages: [
    { duration: '30s', target: 200  },
    { duration: '60s', target: 1000 },
    { duration: '30s', target: 1000 },
    { duration: '30s', target: 0    },
  ],
  thresholds: {
    ws_connect_success:    ['rate>0.95'],
    ws_message_latency_ms: ['p(95)<500'],
    ws_messages_received:  ['count>10000'],
  },
}

const WS_URL = __ENV.WS_URL || 'ws://localhost:4000'
const SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT']

export default function () {
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  const channels = [`ticker:${symbol}`, `ohlcv:${symbol}:1m`, `trades:${symbol}`]

  const res = ws.connect(WS_URL, {}, function (socket) {
    connRate.add(true)

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', channels, symbol }))
    })

    socket.on('message', (data) => {
      const ts = Date.now()
      try {
        const msg = JSON.parse(data)
        if (msg.type === 'welcome') return
        msgReceived.add(1)
        if (msg.data?.ts) latency.add(ts - msg.data.ts)
      } catch {}
    })

    socket.on('error', () => connRate.add(false))

    // stay connected for 20-40s per VU
    sleep(20 + Math.random() * 20)
    socket.send(JSON.stringify({ type: 'unsubscribe', channels, symbol }))
    socket.close()
  })

  check(res, { 'connected': r => r && r.status === 101 })
  sleep(1)
}
