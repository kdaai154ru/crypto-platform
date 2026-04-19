// C:\crypto-platform\ecosystem.config.cjs
module.exports = {
  apps: [
    // ── Gateway ──────────────────────────────────────────────
    {
      name: 'ws-gateway',
      script: 'C:/crypto-platform/apps/ws-gateway/dist/main.js',
      cwd: 'C:/crypto-platform/apps/ws-gateway',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'frontend',
      script: 'node_modules/.bin/nuxt',
      args: 'dev --port 3001',
      cwd: 'C:/crypto-platform/apps/frontend',
      interpreter: 'node',
    },

    // ── Cores (обычный heap) ──────────────────────────────────
    {
      name: 'orchestrator',
      script: 'C:/crypto-platform/apps/orchestrator/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'subscription-core',
      script: 'C:/crypto-platform/cores/subscription-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'normalizer-core',
      script: 'C:/crypto-platform/cores/normalizer-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'aggregator-core',
      script: 'C:/crypto-platform/cores/aggregator-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'trades-core',
      script: 'C:/crypto-platform/cores/trades-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'indicator-core',
      script: 'C:/crypto-platform/cores/indicator-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'screener-core',
      script: 'C:/crypto-platform/cores/screener-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'alert-core',
      script: 'C:/crypto-platform/cores/alert-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'storage-core',
      script: 'C:/crypto-platform/cores/storage-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'worker-core',
      script: 'C:/crypto-platform/cores/worker-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'derivatives-core',
      script: 'C:/crypto-platform/cores/derivatives-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'whale-core',
      script: 'C:/crypto-platform/cores/whale-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'options-core',
      script: 'C:/crypto-platform/cores/options-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'etf-core',
      script: 'C:/crypto-platform/cores/etf-core/dist/main.js',
      restart_delay: 2000,
      max_restarts: 10,
    },

    // ── exchange-core: увеличенный heap из-за ccxt.pro буферов ─
    {
      name: 'exchange-core',
      script: 'C:/crypto-platform/cores/exchange-core/dist/main.js',
      node_args: '--max-old-space-size=2048',
      restart_delay: 2000,
      max_restarts: 10,
    },
  ],
};