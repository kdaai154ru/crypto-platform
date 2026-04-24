// infra/pm2/ecosystem.config.cjs
// Единый PM2 конфиг для ВСЕГО проекта (бэкенд + фронтенд)
// Запуск: pm2 start infra/pm2/ecosystem.config.cjs
// Или через корень: pnpm start:all
"use strict";
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

// FIX #31: лимиты памяти скорректированы под реальное потребление сервисов
// Сервисы с буферами (aggregator, trades, screener) получили увеличенные лимиты
const base = {
  cwd:                       ROOT,
  instances:                 1,
  exec_mode:                 "fork",
  autorestart:               true,
  exp_backoff_restart_delay: 100,
  max_restarts:              10,
  max_memory_restart:        "512M",
  watch:                     false,
  env: { NODE_ENV: "production" },
  error_file: path.join(ROOT, "logs", "pm2-error.log"),
  out_file:   path.join(ROOT, "logs", "pm2-out.log"),
  merge_logs: true,
};

module.exports = {
  apps: [
    // ─── APPS ────────────────────────────────────────────────
    {
      ...base,
      name:   "orchestrator",
      script: path.join(ROOT, "apps/orchestrator/dist/main.js"),
      // Orchestrator: лёгкий HTTP сервер + мониторинг, 512M достаточно
    },
    {
      ...base,
      name:               "ws-gateway",
      script:             path.join(ROOT, "apps/ws-gateway/dist/main.js"),
      // ws-gateway: uWebSockets держит соединения в памяти
      // при 10k клиентах ~200-300MB, 768M с запасом
      max_memory_restart: "768M",
    },

    // ─── FRONTEND ────────────────────────────────────────────
    {
      ...base,
      name:               "frontend",
      script:             path.join(ROOT, "apps/frontend/.output/server/index.mjs"),
      max_memory_restart: "1G",
      env: {
        NODE_ENV:              "production",
        NUXT_PUBLIC_WS_URL:    process.env.NUXT_PUBLIC_WS_URL  || "ws://localhost:4000",
        NUXT_PUBLIC_API_URL:   process.env.NUXT_PUBLIC_API_URL || "http://localhost:3010",
        PORT:                  process.env.FRONTEND_PORT        || "3001",
      },
    },

    // ─── CORES ───────────────────────────────────────────────
    {
      ...base,
      name:               "exchange-core",
      script:             path.join(ROOT, "cores/exchange-core/dist/main.js"),
      // exchange-core: CCXT держит WS соединения + буферы по каждому символу
      // 8G — агрессивно, но CCXT при 100+ символах реально съедает много
      max_restarts:       20,
      max_memory_restart: "8G",
      listen_timeout:     15000,
      env: {
        NODE_ENV:     "production",
        NODE_OPTIONS: "--max-old-space-size=8192",
      },
    },
    {
      ...base,
      name:               "normalizer-core",
      script:             path.join(ROOT, "cores/normalizer-core/dist/main.js"),
      // Stateless transformer — 512M достаточно
    },
    {
      ...base,
      name:               "subscription-core",
      script:             path.join(ROOT, "cores/subscription-core/dist/main.js"),
      // Subscription manager: Map символов + таймеры, 512M достаточно
    },
    {
      ...base,
      name:               "aggregator-core",
      script:             path.join(ROOT, "cores/aggregator-core/dist/main.js"),
      // aggregator-core: держит CandleState Map для всех символов × таймфреймов
      // при 500 символах × 13 tf = 6500 записей — нужно 1G
      max_memory_restart: "1G",
    },
    {
      ...base,
      name:               "trades-core",
      script:             path.join(ROOT, "cores/trades-core/dist/main.js"),
      // trades-core: TradeProcessor буфер до 50k трейдов + ClickHouse клиент
      // при пиковой нагрузке буфер может занять ~200-300MB
      max_memory_restart: "1G",
    },
    {
      ...base,
      name:               "indicator-core",
      script:             path.join(ROOT, "cores/indicator-core/dist/main.js"),
      // indicator-core: вычисления RSI/MACD/etc — нужны скользящие окна
      max_memory_restart: "768M",
    },
    {
      ...base,
      name:               "screener-core",
      script:             path.join(ROOT, "cores/screener-core/dist/main.js"),
      // screener-core: хранит свечи для RSI по всем символам × tf (warm-up)
      // при 1000 символах × 6 tf × 200 свечей = 1.2M объектов — нужно 2G
      max_memory_restart: "2G",
      env: {
        NODE_ENV:     "production",
        NODE_OPTIONS: "--max-old-space-size=1536",
      },
    },
    {
      ...base,
      name:               "alert-core",
      script:             path.join(ROOT, "cores/alert-core/dist/main.js"),
      // alert-core: prevValues Map + правила — 512M достаточно
    },
    {
      ...base,
      name:   "derivatives-core",
      script: path.join(ROOT, "cores/derivatives-core/dist/main.js"),
    },
    {
      ...base,
      name:   "whale-core",
      script: path.join(ROOT, "cores/whale-core/dist/main.js"),
    },
    {
      ...base,
      name:   "etf-core",
      script: path.join(ROOT, "cores/etf-core/dist/main.js"),
    },
    {
      ...base,
      name:   "options-core",
      script: path.join(ROOT, "cores/options-core/dist/main.js"),
    },
    {
      ...base,
      name:   "worker-core",
      script: path.join(ROOT, "cores/worker-core/dist/main.js"),
    },
    {
      ...base,
      name:   "storage-core",
      script: path.join(ROOT, "cores/storage-core/dist/main.js"),
    },
  ],
};
