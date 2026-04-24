// apps/frontend/ecosystem.config.cjs
// Используется для запуска фронтенда через PM2 в dev-режиме
// Путь вычисляется динамически — не хардкодить абсолютный путь!
"use strict";
const path = require("path");

const FRONTEND_ROOT = __dirname; // apps/frontend/

module.exports = {
  apps: [
    {
      name: "frontend",
      script: path.join(FRONTEND_ROOT, "node_modules", ".bin", "nuxt"),
      args: "dev --port 3001",
      cwd: FRONTEND_ROOT,
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        NUXT_PUBLIC_WS_URL: process.env.NUXT_PUBLIC_WS_URL || "ws://localhost:4000",
        NUXT_PUBLIC_API_URL: process.env.NUXT_PUBLIC_API_URL || "http://localhost:3010",
      },
      error_file: path.join(FRONTEND_ROOT, "..", "..", "logs", "frontend-error.log"),
      out_file: path.join(FRONTEND_ROOT, "..", "..", "logs", "frontend-out.log"),
      merge_logs: true,
    },
  ],
};