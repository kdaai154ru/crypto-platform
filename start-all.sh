#!/bin/bash
# ============================================================
# start-all.sh  —  Полный запуск crypto-platform (Linux/Mac)
# Запуск: bash start-all.sh
# Полный пересброс: bash start-all.sh --clean
# ============================================================

set -euo pipefail

CLEAN=false
ENV="production"

for arg in "$@"; do
  case $arg in
    --clean) CLEAN=true ;;
    --dev)   ENV="development" ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

step() { echo -e "\n${CYAN}[$1] $2${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
fail() { echo -e "  ${RED}✗ $1${NC}"; exit 1; }

wait_healthy() {
  local container=$1 label=$2 timeout=${3:-90}
  echo -n "  Ожидание $label"
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    local status
    status=$(docker inspect --format "{{.State.Health.Status}}" "$container" 2>/dev/null || echo "")
    if [ "$status" = "healthy" ]; then echo -e " ${GREEN}OK${NC}"; return 0; fi
    local running
    running=$(docker inspect --format "{{.State.Running}}" "$container" 2>/dev/null || echo "false")
    local has_health
    has_health=$(docker inspect --format "{{.State.Health}}" "$container" 2>/dev/null || echo "")
    if [ "$running" = "true" ] && [ -z "$has_health" ]; then
      echo -e " ${YELLOW}OK (no healthcheck)${NC}"; return 0
    fi
    echo -n "."
    sleep 3; elapsed=$((elapsed + 3))
  done
  echo ""
  fail "$container не стал healthy за ${timeout}с. Посмотри: docker logs $container --tail 50"
}

# ── 0. Зависимости ──────────────────────────────────────────
step "0" "Проверяем зависимости"
for cmd in docker pnpm node; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd не найден в PATH"
done
if ! command -v pm2 >/dev/null 2>&1; then
  echo -e "  ${YELLOW}pm2 не найден, устанавливаем...${NC}"
  npm install -g pm2
fi
ok "docker, node, pnpm, pm2 найдены"

# ── 0b. .env ────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo -e "  ${YELLOW}.env не найден! Копируем из .env.example...${NC}"
  cp .env.example .env
  echo -e "  ${YELLOW}Открой .env, задай реальные пароли и запусти снова.${NC}"
  exit 1
fi
ok ".env найден"

# ── 1. PM2 стоп ─────────────────────────────────────────────
step "1" "Останавливаем старые PM2-процессы"
pm2 delete all 2>/dev/null || true
ok "PM2 очищен"

# ── 2. Git pull ─────────────────────────────────────────────
step "2" "Обновляем код из git"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo -e "  ${YELLOW}Обнаружены локальные изменения. Stash'им...${NC}"
  git stash push -m "auto-stash before start-all $(date +%Y%m%d-%H%M%S)"
  STASHED=true
else
  STASHED=false
fi
git fetch origin main 2>/dev/null
git reset --hard origin/main 2>/dev/null
if [ "$STASHED" = "true" ]; then
  echo -e "  ${YELLOW}Применяем stash обратно...${NC}"
  git stash pop 2>/dev/null || true
fi
ok "Код обновлён"

# ── 3. Docker ───────────────────────────────────────────────
step "3" "Поднимаем Docker-инфраструктуру"

if [ "$CLEAN" = "true" ]; then
  echo -e "  ${YELLOW}--clean: останавливаем и удаляем volumes...${NC}"
  docker compose down -v 2>/dev/null || true
fi

docker compose up -d
ok "Контейнеры запущены, ждём healthcheck..."

wait_healthy "crypto-postgres"   "PostgreSQL"  60
wait_healthy "crypto-valkey"     "Valkey"       60
wait_healthy "crypto-clickhouse" "ClickHouse"  120
ok "Инфраструктура готова"

# ── 4. Миграции ─────────────────────────────────────────────
step "4" "Применяем миграции БД"

echo "  PostgreSQL..."
docker compose exec -T postgres \
  psql -U crypto -d crypto < infra/migrations/postgres/001_initial.sql
ok "PostgreSQL миграция применена"

echo "  ClickHouse..."
CH_PASS=$(grep -E "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
docker compose exec -T clickhouse \
  clickhouse-client --user default --password "${CH_PASS:-}" --multiquery \
  < infra/migrations/clickhouse/001_initial.sql
ok "ClickHouse миграция применена"

# ── 5. pnpm install ─────────────────────────────────────────
step "5" "Устанавливаем зависимости"
pnpm install --frozen-lockfile
ok "Зависимости установлены"

# ── 6. Build ────────────────────────────────────────────────
step "6" "Собираем проект (pnpm build)"
export NODE_ENV=production
pnpm run build
ok "Сборка завершена"

# ── 7. PM2 ──────────────────────────────────────────────────
step "7" "Запускаем всё через PM2"
if [ "$ENV" = "development" ]; then
  pm2 start infra/pm2/ecosystem.config.cjs --env development
else
  pm2 start infra/pm2/ecosystem.config.cjs
fi
pm2 save
sleep 5
pm2 status

# ── Итог ────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN} ✅  crypto-platform запущен!${NC}"
echo -e "${GREEN}================================================${NC}"
echo -e "  Frontend       http://localhost"
echo -e "  Frontend (dev) http://localhost:3001"
echo -e "  Orchestrator   http://localhost:3010"
echo -e "  WS Gateway     ws://localhost:4000"
echo -e "  Grafana        http://localhost:3100"
echo -e "  Prometheus     http://localhost:9090"
echo -e "${GREEN}================================================${NC}"
echo -e "  Логи:  pm2 logs"
echo -e "  Стоп:  pm2 delete all && docker compose down"
