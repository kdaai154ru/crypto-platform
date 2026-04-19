// infra/pm2/ecosystem.config.cjs
"use strict";
const base = {
  autorestart: true,
  exp_backoff_restart_delay: 100,
  max_restarts: 10,
  max_memory_restart: "512M",
  env: { NODE_ENV: "production" },
};
module.exports = {
  apps: [
    { ...base, name: "orchestrator",     script: "apps/orchestrator/dist/main.js" },
    { ...base, name: "ws-gateway",       script: "apps/ws-gateway/dist/main.js" },
    { ...base, name: "exchange-core",    script: "cores/exchange-core/dist/main.js",    max_restarts: 20 },
    { ...base, name: "normalizer-core",  script: "cores/normalizer-core/dist/main.js" },
    { ...base, name: "subscription-core",script: "cores/subscription-core/dist/main.js" },
    { ...base, name: "aggregator-core",  script: "cores/aggregator-core/dist/main.js" },
    { ...base, name: "trades-core",      script: "cores/trades-core/dist/main.js" },
    { ...base, name: "indicator-core",   script: "cores/indicator-core/dist/main.js" },
    { ...base, name: "screener-core",    script: "cores/screener-core/dist/main.js",    max_memory_restart: "1G" },
    { ...base, name: "alert-core",       script: "cores/alert-core/dist/main.js" },
    { ...base, name: "derivatives-core", script: "cores/derivatives-core/dist/main.js" },
    { ...base, name: "whale-core",       script: "cores/whale-core/dist/main.js" },
    { ...base, name: "etf-core",         script: "cores/etf-core/dist/main.js" },
    { ...base, name: "options-core",     script: "cores/options-core/dist/main.js" },
    { ...base, name: "worker-core",      script: "cores/worker-core/dist/main.js" },
    { ...base, name: "storage-core",     script: "cores/storage-core/dist/main.js" },
  ],
};
