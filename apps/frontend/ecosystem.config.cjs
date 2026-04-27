// apps/frontend/ecosystem.config.cjs
// Windows PM2 fix: запускаем node напрямую с nuxt.mjs
"use strict";
const path = require("path");

const FRONTEND_ROOT = __dirname; // apps/frontend/
const NUXT_BIN = path.join(FRONTEND_ROOT, "node_modules", "nuxt", "bin", "nuxt.mjs");

module.exports = {
  apps: [
    {
      name: "frontend",
      script: NUXT_BIN,
      args: "dev",
      cwd: FRONTEND_ROOT,
      interpreter: process.execPath, // полный путь к node.exe (тот же что запустил PM2)
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        PORT: "3001",
        NUXT_PUBLIC_WS_URL:  process.env.NUXT_PUBLIC_WS_URL  || "ws://localhost:4000",
        NUXT_PUBLIC_API_URL: process.env.NUXT_PUBLIC_API_URL || "http://localhost:3010",
      },
      error_file: path.join(FRONTEND_ROOT, "..", "..", "logs", "frontend-error.log"),
      out_file:   path.join(FRONTEND_ROOT, "..", "..", "logs", "frontend-out.log"),
      merge_logs: true,
    },
  ],
};
