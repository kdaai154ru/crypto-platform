# ============================================================
# start-all.ps1  —  Полный запуск crypto-platform (Windows)
# Запуск: .\start-all.ps1
# Полный пересброс: .\start-all.ps1 -Clean
# ============================================================
param(
  [switch]$Clean,
  [string]$Env = "development"
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot

Set-Location $ROOT

function Write-Step { param($n, $text) Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-OK   { param($text)     Write-Host "  ✓ $text" -ForegroundColor Green }
function Write-Fail { param($text)     Write-Host "  ✗ $text" -ForegroundColor Red; exit 1 }

function Wait-Docker {
  param($container, $label, $timeoutSec = 90)
  Write-Host "  Ожидание $label" -NoNewline
  $elapsed = 0
  while ($elapsed -lt $timeoutSec) {
    $status = docker inspect --format "{{.State.Health.Status}}" $container 2>$null
    if ($status -eq "healthy") { Write-Host " OK" -ForegroundColor Green; return }
    if ($status -eq "running" -and -not (docker inspect --format "{{.State.Health}}" $container 2>$null)) {
      # контейнер без healthcheck
      Write-Host " OK (no healthcheck)" -ForegroundColor Yellow; return
    }
    Write-Host -NoNewline "."
    Start-Sleep 3
    $elapsed += 3
  }
  Write-Host " TIMEOUT" -ForegroundColor Red
  Write-Fail "$container не стал healthy за $timeoutSec сек. Логи: docker logs $container --tail 50"
}

# ── 0. Проверка зависимостей ────────────────────────────────
Write-Step "0" "Проверяем зависимости"
foreach ($cmd in @("docker","pnpm","node")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Fail "$cmd не найден в PATH" }
}
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "  pm2 не найден, устанавливаем..." -ForegroundColor Yellow
  npm install -g pm2
}
Write-OK "docker, node, pnpm, pm2 — найдены"

# ── 0b. Проверяем .env ─────────────────────────────────────
if (-not (Test-Path ".env")) {
  Write-Host "  .env не найден! Копируем из .env.example..." -ForegroundColor Yellow
  Copy-Item ".env.example" ".env"
  Write-Host "  Открой .env и задай реальные пароли, затем запусти снова." -ForegroundColor Yellow
  exit 1
}
Write-OK ".env найден"

# ── 1. Стоп старых PM2-процессов ───────────────────────────
Write-Step "1" "Останавливаем старые PM2-процессы"
pm2 delete all 2>$null
Write-OK "PM2 очищен"

# ── 2. Git pull (безопасный) ────────────────────────────────
Write-Step "2" "Обновляем код из git"
$conflict = git status --porcelain 2>$null | Where-Object { $_ -match "^\s?M" }
if ($conflict) {
  Write-Host "  Обнаружены локальные изменения. Stash'им..." -ForegroundColor Yellow
  git stash push -m "auto-stash before start-all $(Get-Date -Format 'yyyyMMdd-HHmmss')"
}
git fetch origin main 2>&1 | Out-Null
git reset --hard origin/main 2>&1 | Out-Null
if ($conflict) {
  Write-Host "  Применяем stash обратно..." -ForegroundColor Yellow
  git stash pop 2>$null
}
Write-OK "Код обновлён"

# ── 3. Docker инфраструктура ────────────────────────────────
Write-Step "3" "Поднимаем Docker-инфраструктуру"

if ($Clean) {
  Write-Host "  -Clean: останавливаем и удаляем volumes..." -ForegroundColor Yellow
  docker compose down -v 2>$null
}

docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up завершился с ошибкой" }
Write-OK "Контейнеры запущены, ждём healthcheck..."

# Ожидаем готовности каждого сервиса
Wait-Docker "crypto-postgres"    "PostgreSQL"  60
Wait-Docker "crypto-valkey"      "Valkey"      60
Wait-Docker "crypto-clickhouse"  "ClickHouse"  120
Write-OK "Инфраструктура готова"

# ── 4. Миграции ─────────────────────────────────────────────
Write-Step "4" "Применяем миграции БД"

Write-Host "  PostgreSQL migrations..."
Get-Content "infra/migrations/postgres/001_initial.sql" |
  docker compose exec -T postgres psql -U crypto -d crypto
if ($LASTEXITCODE -ne 0) { Write-Fail "PostgreSQL миграция завершилась с ошибкой" }

Write-Host "  ClickHouse migrations..."
Get-Content "infra/migrations/clickhouse/001_initial.sql" |
  docker compose exec -T clickhouse clickhouse-client `
    --user default `
    --password (Select-String "CLICKHOUSE_PASSWORD=(.+)" ".env" | ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() }) `
    --multiquery
if ($LASTEXITCODE -ne 0) { Write-Fail "ClickHouse миграция завершилась с ошибкой" }
Write-OK "Миграции применены"

# ── 5. pnpm install ─────────────────────────────────────────
Write-Step "5" "Устанавливаем зависимости (pnpm install)"
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm install завершился с ошибкой" }
Write-OK "Зависимости установлены"

# ── 6. Build ────────────────────────────────────────────────
Write-Step "6" "Собираем весь проект (pnpm build)"
$env:NODE_ENV = "production"
pnpm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm build завершился с ошибкой" }
Write-OK "Сборка завершена"

# ── 7. PM2 запуск ───────────────────────────────────────────
Write-Step "7" "Запускаем всё через PM2"
pm2 start infra/pm2/ecosystem.config.cjs
if ($LASTEXITCODE -ne 0) { Write-Fail "PM2 start завершился с ошибкой" }
pm2 save
Start-Sleep 5
pm2 status

# ── Итог ────────────────────────────────────────────────────
Write-Host "`n================================================" -ForegroundColor Green
Write-Host " ✅  crypto-platform запущен!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Frontend      http://localhost" -ForegroundColor White
Write-Host "  Frontend (dev) http://localhost:3001" -ForegroundColor White
Write-Host "  Orchestrator  http://localhost:3010" -ForegroundColor White
Write-Host "  WS Gateway    ws://localhost:4000" -ForegroundColor White
Write-Host "  Grafana       http://localhost:3100" -ForegroundColor White
Write-Host "  Prometheus    http://localhost:9090" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Логи: pm2 logs" -ForegroundColor Gray
Write-Host "  Стоп: pm2 delete all && docker compose down" -ForegroundColor Gray
