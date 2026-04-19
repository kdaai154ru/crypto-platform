// infra/pm2/ecosystem.config.cjs
"use strict";
const path = require('path');

// Корень монорепозитория: два уровня вверх от infra/pm2/
const ROOT = path.resolve(__dirname, '..', '..');

const base = {
  cwd:                       ROOT,
  instances:                 1,
  exec_mode:                 'fork',
  autorestart:               true,
  exp_backoff_restart_delay: 100,
  max_restarts:              10,
  max_memory_restart:        '512M',
  env: { NODE_ENV: 'production' },
  error_file: path.join(ROOT, 'logs', 'pm2-error.log'),
  out_file:   path.join(ROOT, 'logs', 'pm2-out.log'),
  merge_logs: true,
};

module.exports = {
  apps: [
    {
      ...base,
      name:   'orchestrator',
      script: path.join(ROOT, 'apps/orchestrator/dist/main.js'),
    },
    {
      ...base,
      name:   'ws-gateway',
      script: path.join(ROOT, 'apps/ws-gateway/dist/main.js'),
    },
    {
      ...base,
      name:               'exchange-core',
      script:             path.join(ROOT, 'cores/exchange-core/dist/main.js'),
      max_restarts:       20,
      max_memory_restart: '2G',
      listen_timeout:     15000,
      node_args:          '--max-old-space-size=2048',
    },
    {
      ...base,
      name:   'normalizer-core',
      script: path.join(ROOT, 'cores/normalizer-core/dist/main.js'),
    },
    {
      ...base,
      name:   'subscription-core',
      script: path.join(ROOT, 'cores/subscription-core/dist/main.js'),
    },
    {
      ...base,
      name:   'aggregator-core',
      script: path.join(ROOT, 'cores/aggregator-core/dist/main.js'),
    },
    {
      ...base,
      name:   'trades-core',
      script: path.join(ROOT, 'cores/trades-core/dist/main.js'),
    },
    {
      ...base,
      name:   'indicator-core',
      script: path.join(ROOT, 'cores/indicator-core/dist/main.js'),
    },
    {
      ...base,
      name:               'screener-core',
      script:             path.join(ROOT, 'cores/screener-core/dist/main.js'),
      max_memory_restart: '1G',
    },
    {
      ...base,
      name:   'alert-core',
      script: path.join(ROOT, 'cores/alert-core/dist/main.js'),
    },
    {
      ...base,
      name:   'derivatives-core',
      script: path.join(ROOT, 'cores/derivatives-core/dist/main.js'),
    },
    {
      ...base,
      name:   'whale-core',
      script: path.join(ROOT, 'cores/whale-core/dist/main.js'),
    },
    {
      ...base,
      name:   'etf-core',
      script: path.join(ROOT, 'cores/etf-core/dist/main.js'),
    },
    {
      ...base,
      name:   'options-core',
      script: path.join(ROOT, 'cores/options-core/dist/main.js'),
    },
    {
      ...base,
      name:   'worker-core',
      script: path.join(ROOT, 'cores/worker-core/dist/main.js'),
    },
    {
      ...base,
      name:   'storage-core',
      script: path.join(ROOT, 'cores/storage-core/dist/main.js'),
    },
  ],
};
