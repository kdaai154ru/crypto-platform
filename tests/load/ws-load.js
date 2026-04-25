// tests/load/ws-load.js
// k6 WebSocket load test — covers normal load, 1k+ clients fanout, and reconnect scenario
// Run: k6 run tests/load/ws-load.js
// Run with env: WS_URL=ws://my-server:4000 k6 run tests/load/ws-load.js
import ws from 'k6/ws'
import { check, sleep, group } from 'k6'
import { Counter, Rate, Trend, Gauge } from 'k6/metrics'

const msgReceived      = new Counter('ws_messages_received')
const msgDuplicates    = new Counter('ws_duplicate_messages')   // NEW: dupe detector
const connRate         = new Rate('ws_connect_success')
const latency          = new Trend('ws_message_latency_ms')
const activeConns      = new Gauge('ws_active_connections')      // NEW: live gauge
const reconnectSuccess = new Rate('ws_reconnect_success')        // NEW: reconnect health

export const options = {
  scenarios: {
    // Scenario 1: normal ramp to 1000 clients (fanout stress)
    fanout_stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200  },
        { duration: '60s', target: 1000 },
        { duration: '60s', target: 1000 },  // hold at 1k to measure fanout
        { duration: '30s', target: 0    },
      ],
      gracefulRampDown: '10s',
    },
    // Scenario 2: reconnect churn — clients connect/disconnect rapidly
    reconnect_churn: {
      executor: 'constant-arrival-rate',
      rate:     20,           // 20 new connections per second
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 50,
      maxVUs: 100,
      startTime: '91s',       // starts after fanout_stress ramp-up is done
    },
  },
  thresholds: {
    ws_connect_success:    ['rate>0.95'],
    ws_message_latency_ms: ['p(95)<500', 'p(99)<1000'],
    ws_messages_received:  ['count>10000'],
    ws_duplicate_messages: ['count<10'],   // near-zero duplicates
    ws_reconnect_success:  ['rate>0.90'],
  },
}

const WS_URL = __ENV.WS_URL || 'ws://localhost:4000'
const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']

// Duplicate detector: track last 5 message IDs per VU (keyed by __VU)
const seenIds = new Map()

function checkDuplicate(vuId, msgId) {
  if (!msgId) return
  const ring = seenIds.get(vuId) || []
  if (ring.includes(msgId)) {
    msgDuplicates.add(1)
  }
  ring.push(msgId)
  if (ring.length > 20) ring.shift()
  seenIds.set(vuId, ring)
}

export default function () {
  const symbol   = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  const channels = [`ticker:${symbol}`, `ohlcv:${symbol}:1m`, `trades:${symbol}`]
  const vuId     = __VU

  group('websocket_session', () => {
    const res = ws.connect(WS_URL, { tags: { scenario: __SCENARIO } }, function (socket) {
      connRate.add(true)
      activeConns.add(1)

      socket.on('open', () => {
        socket.send(JSON.stringify({ type: 'subscribe', channels, symbol }))
      })

      socket.on('message', (data) => {
        const ts = Date.now()
        try {
          const msg = JSON.parse(data)
          if (msg.type === 'welcome') return

          msgReceived.add(1)

          // Latency measurement
          if (msg.data?.ts) latency.add(ts - msg.data.ts)

          // Duplicate detection by message ID (if present)
          if (msg.id) checkDuplicate(vuId, msg.id)
        } catch {
          // Ignore unparseable messages
        }
      })

      socket.on('error', () => connRate.add(false))
      socket.on('close', () => activeConns.add(-1))

      // Hold connection for varying durations to simulate real users
      const holdMs = 10_000 + Math.random() * 20_000
      sleep(holdMs / 1000)

      socket.send(JSON.stringify({ type: 'unsubscribe', channels, symbol }))
      socket.close()
    })

    check(res, { 'status 101 (upgrade ok)': r => r && r.status === 101 })
  })

  if (__SCENARIO === 'reconnect_churn') {
    // Quick reconnect: immediately reconnect after close
    sleep(0.1)
    const res2 = ws.connect(WS_URL, {}, function (socket) {
      socket.on('open', () => {
        socket.send(JSON.stringify({ type: 'subscribe', channels: [`ticker:${symbol}`], symbol }))
        reconnectSuccess.add(true)
        sleep(2)
        socket.close()
      })
      socket.on('error', () => reconnectSuccess.add(false))
    })
    check(res2, { 'reconnect ok': r => r && r.status === 101 })
  }

  sleep(1)
}
