// apps/frontend/ecosystem.config.cjs
// Windows PM2: единственный надёжный способ — запускать через cmd /c npm run dev
"use strict";
const path = require("path");

const FRONTEND_ROOT = __dirname; // apps/frontend/

module.exports = {
  apps: [
    {
      name: "frontend",
      script: "npm",
      args: "run dev",
      cwd: FRONTEND_ROOT,
      interpreter: "none",   // не node, PM2 ищет npm.cmd сам через PATH
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
