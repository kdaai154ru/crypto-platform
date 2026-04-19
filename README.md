# Crypto Analytics Platform

Модульная realtime крипто-аналитическая платформа.

## Стек
- **Frontend**: Nuxt 3, Vue 3, Pinia, lightweight-charts, vue-grid-layout
- **Backend**: Node.js 22, TypeScript, CCXT Pro, PM2
- **Cache/PubSub**: Valkey (iovalkey)
- **Analytics DB**: ClickHouse
- **App DB**: PostgreSQL 17
- **Monorepo**: pnpm + Turborepo

## Быстрый старт

```bash
# 1. Инфраструктура
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Зависимости
pnpm install

# 3. Миграции
# Linux/Mac:
bash scripts/migrate.sh
# Windows:
.\scripts\migrate.ps1

# 4. Собрать и запустить backend
npm install -g pm2
pnpm build
pm2 start infra/pm2/ecosystem.config.cjs
pm2 status

# 5. Frontend
cd apps/frontend && pnpm dev
```

## Архитектура

```
┌──────────────────────────────────────────────────────┐
│                  ws-gateway (uWS)                    │
│               Fanout → WS клиенты                    │
└─────────────────────┬────────────────────────────────┘
                      │ Valkey PubSub
┌─────────────────────▼────────────────────────────────┐
│    exchange → normalizer → aggregator → storage      │
│              ↓                                        │
│    trades-core  indicator-core  screener-core        │
│    derivatives  whale   alert   etf   options        │
└──────────────────────────────────────────────────────┘
                      ↑
              orchestrator (health + status)
```

## Процессы PM2 (16 total)
orchestrator, ws-gateway, exchange-core, normalizer-core,
subscription-core, aggregator-core, trades-core, indicator-core,
screener-core, alert-core, derivatives-core, whale-core,
etf-core, options-core, worker-core, storage-core
