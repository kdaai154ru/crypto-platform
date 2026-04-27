// apps/frontend/ecosystem.config.cjs
// Windows-совместимый запуск nuxt dev через PM2.
// На Windows .bin/nuxt — bash-шебанг, Node не может его исполнить напрямую.
// Решение: указываем реальный JS-файл nuxt через node_modules/nuxt/bin/nuxt.mjs
"use strict";
const path = require("path");

const FRONTEND_ROOT = __dirname; // apps/frontend/

module.exports = {
  apps: [
    {
      name: "frontend",
      script: "node_modules/nuxt/bin/nuxt.mjs",
      args: "dev --port 3001",
      cwd: FRONTEND_ROOT,
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        NUXT_PUBLIC_WS_URL:  process.env.NUXT_PUBLIC_WS_URL  || "ws://localhost:4000",
        NUXT_PUBLIC_API_URL: process.env.NUXT_PUBLIC_API_URL || "http://localhost:3010",
      },
      error_file: path.join(FRONTEND_ROOT, "..", "..", "logs", "frontend-error.log"),
      out_file:   path.join(FRONTEND_ROOT, "..", "..", "logs", "frontend-out.log"),
      merge_logs: true,
    },
  ],
};
