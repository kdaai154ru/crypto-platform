// infra/pm2/ecosystem.config.cjs
// Единый PM2 конфиг для ВСЕГО проекта (бэкенд + фронтенд)
// Запуск:       pm2 start infra/pm2/ecosystem.config.cjs              (production)
// Dev-запуск:   pm2 start infra/pm2/ecosystem.config.cjs --env development
// Или через корень: pnpm start:all
"use strict";
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

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
  env_development: { NODE_ENV: "development" },
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
    },
    {
      ...base,
      name:               "ws-gateway",
      script:             path.join(ROOT, "apps/ws-gateway/dist/main.js"),
      max_memory_restart: "768M",
    },

    // ─── FRONTEND ────────────────────────────────────────────
    // PRODUCTION: runs pre-built .output bundle
    // DEVELOPMENT: runs `nuxt dev` with Vite HMR — no rebuild needed on file changes
    {
      ...base,
      name:               "frontend",
      // production script (default)
      script:             path.join(ROOT, "apps/frontend/.output/server/index.mjs"),
      cwd:                path.join(ROOT, "apps/frontend"),
      max_memory_restart: "1G",
      env: {
        NODE_ENV:              "production",
        NUXT_PUBLIC_WS_URL:    process.env.NUXT_PUBLIC_WS_URL  || "ws://localhost:4000",
        NUXT_PUBLIC_API_URL:   process.env.NUXT_PUBLIC_API_URL || "http://localhost:3010",
        PORT:                  process.env.FRONTEND_PORT        || "3001",
      },
      // development: override script to use nuxt dev (Vite HMR)
      env_development: {
        NODE_ENV:              "development",
        NUXT_PUBLIC_WS_URL:    process.env.NUXT_PUBLIC_WS_URL  || "ws://localhost:4000",
        NUXT_PUBLIC_API_URL:   process.env.NUXT_PUBLIC_API_URL || "http://localhost:3010",
        PORT:                  process.env.FRONTEND_PORT        || "3001",
        // PM2 picks up PM2_SCRIPT/PM2_ARGS when NODE_ENV=development
        // We rely on start-all.ps1 passing --env development
        // The actual script swap is handled below via the dev override block
      },
    },

    // DEV-ONLY frontend entry — used when start-all.ps1 passes --env development
    // PM2 matches by name; start-all should start "frontend-dev" in dev mode
    // and skip "frontend" (production build).
    // Alternatively: use a single entry with conditional script (see start-all.ps1).
    {
      name:               "frontend-dev",
      script:             "pnpm",
      args:               "dev --port 3001",
      cwd:                path.join(ROOT, "apps/frontend"),
      instances:          1,
      exec_mode:          "fork",
      autorestart:        true,
      exp_backoff_restart_delay: 500,
      max_restarts:       5,
      max_memory_restart: "1G",
      watch:              false,
      kill_timeout:       5000,
      error_file: path.join(ROOT, "logs", "pm2-error.log"),
      out_file:   path.join(ROOT, "logs", "pm2-out.log"),
      merge_logs: true,
      env: {
        NODE_ENV:              "development",
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
      max_restarts:       20,
      max_memory_restart: "8G",
      listen_timeout:     15000,
      env: {
        NODE_ENV:     "production",
        NODE_OPTIONS: "--max-old-space-size=8192",
      },
      env_development: {
        NODE_ENV:     "development",
        NODE_OPTIONS: "--max-old-space-size=8192",
      },
    },
    {
      ...base,
      name:   "normalizer-core",
      script: path.join(ROOT, "cores/normalizer-core/dist/main.js"),
    },
    {
      ...base,
      name:   "subscription-core",
      script: path.join(ROOT, "cores/subscription-core/dist/main.js"),
    },
    {
      ...base,
      name:               "aggregator-core",
      script:             path.join(ROOT, "cores/aggregator-core/dist/main.js"),
      max_memory_restart: "1G",
    },
    {
      ...base,
      name:               "trades-core",
      script:             path.join(ROOT, "cores/trades-core/dist/main.js"),
      max_memory_restart: "1G",
    },
    {
      ...base,
      name:               "indicator-core",
      script:             path.join(ROOT, "cores/indicator-core/dist/main.js"),
      max_memory_restart: "768M",
    },
    {
      ...base,
      name:               "screener-core",
      script:             path.join(ROOT, "cores/screener-core/dist/main.js"),
      max_memory_restart: "2G",
      env: {
        NODE_ENV:     "production",
        NODE_OPTIONS: "--max-old-space-size=1536",
      },
      env_development: {
        NODE_ENV:     "development",
        NODE_OPTIONS: "--max-old-space-size=1536",
      },
    },
    {
      ...base,
      name:   "alert-core",
      script: path.join(ROOT, "cores/alert-core/dist/main.js"),
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
