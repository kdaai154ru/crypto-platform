# ============================================================
# generate-env.ps1
# Генерирует все секреты и записывает готовый .env
# Запуск: .\scripts\generate-env.ps1
# ============================================================

param(
    [string]$EnvFile = ".env",
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── цвета вывода ─────────────────────────────────────────────
function Write-Ok  { param($msg) Write-Host "  ✅ $msg" -ForegroundColor Green  }
function Write-Inf { param($msg) Write-Host "  ℹ️  $msg" -ForegroundColor Cyan   }
function Write-Wrn { param($msg) Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  🔑 crypto-platform · генератор .env" -ForegroundColor Magenta
Write-Host "  ────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── проверка: .env уже существует ────────────────────────────
if ((Test-Path $EnvFile) -and -not $Force) {
    Write-Wrn ".env уже существует. Используй -Force для перезаписи."
    Write-Wrn "Пример: .\scripts\generate-env.ps1 -Force"
    exit 0
}

# ── генератор секрета через .NET RNG ─────────────────────────
function New-Secret {
    param([int]$Bytes = 32)
    $rng   = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] $Bytes
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return ([System.BitConverter]::ToString($bytes) -replace '-','').ToLower()
}

# ── генерация значений ────────────────────────────────────────
Write-Inf "Генерирую JWT_SECRET (64 hex chars)..."
$jwtSecret = New-Secret -Bytes 32

Write-Inf "Генерирую GRAFANA пароль..."
$grafanaPassword = New-Secret -Bytes 16

Write-Inf "Генерирую PG пароль..."
$pgPassword = New-Secret -Bytes 16

Write-Inf "Генерирую VALKEY пароль..."
$valkeyPassword = New-Secret -Bytes 16

Write-Inf "Генерирую CLICKHOUSE пароль..."
$chPassword = New-Secret -Bytes 16

Write-Host ""

# ── записываем .env ───────────────────────────────────────────
$envContent = @"
# ============================================================
# .env — crypto-platform
# Сгенерировано: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# НЕ коммить этот файл! (.gitignore уже исключает .env)
# ============================================================

# ─── General ────────────────────────────────────────────────
# development = JWT-проверка в ws-gateway отключена (bypass)
# production  = JWT обязателен
NODE_ENV=development
LOG_LEVEL=info

# ─── Valkey / Redis ─────────────────────────────────────────
VALKEY_HOST=localhost
VALKEY_PORT=6379
VALKEY_PASSWORD=$valkeyPassword

# ─── PostgreSQL ─────────────────────────────────────────────
PG_HOST=localhost
PG_PORT=5432
PG_USER=crypto
PG_PASSWORD=$pgPassword
PG_DB=crypto
POSTGRES_USER=crypto
POSTGRES_PASSWORD=$pgPassword
POSTGRES_DB=crypto

# ─── ClickHouse ─────────────────────────────────────────────
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=18123
CLICKHOUSE_TCP_PORT=19000
CLICKHOUSE_DB=crypto
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=$chPassword

# ─── WebSocket Gateway ──────────────────────────────────────
WS_PORT=4000
# Origin validation (CSWSH). Пусто = отключено (только dev!)
WS_ALLOWED_ORIGINS=

# ─── Orchestrator ───────────────────────────────────────────
ORCHESTRATOR_PORT=3010

# ─── Frontend (Nuxt) ────────────────────────────────────────
FRONTEND_PORT=3001
NUXT_PUBLIC_WS_URL=ws://localhost:4000
NUXT_PUBLIC_API_URL=http://localhost:3010

# ─── Auth ───────────────────────────────────────────────────
JWT_SECRET=$jwtSecret
JWT_ISSUER=crypto-platform

# ─── Exchanges ──────────────────────────────────────────────
EXCHANGE_LIST=binance,bybit,okx
EXCHANGE_CCXT_VERSION=4.4.82

# ─── Grafana ────────────────────────────────────────────────
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$grafanaPassword

# ─── Metrics ports (per service) ────────────────────────────
# ВАЖНО: 9090 занят Prometheus в Docker — каждый сервис
#        использует свой порт ниже.
ORCHESTRATOR_METRICS_PORT=4016
WS_GATEWAY_METRICS_PORT=4008
FRONTEND_METRICS_PORT=4017
EXCHANGE_METRICS_PORT=4001
NORMALIZER_METRICS_PORT=4002
SUBSCRIPTION_METRICS_PORT=4015
AGGREGATOR_METRICS_PORT=4003
TRADES_METRICS_PORT=4005
INDICATOR_METRICS_PORT=4006
SCREENER_METRICS_PORT=4004
ALERT_METRICS_PORT=4007
DERIVATIVES_METRICS_PORT=4012
WHALE_METRICS_PORT=4011
ETF_METRICS_PORT=4013
OPTIONS_METRICS_PORT=4014
WORKER_METRICS_PORT=4009
STORAGE_METRICS_PORT=4010
"@

Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
Write-Ok ".env создан: $((Resolve-Path $EnvFile).Path)"

# ── вывод секретов ────────────────────────────────────────────
Write-Host ""
Write-Host "  📋 Сгенерированные секреты:" -ForegroundColor Magenta
Write-Host "  ────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  JWT_SECRET        = $jwtSecret" -ForegroundColor White
Write-Host "  PG_PASSWORD       = $pgPassword"       -ForegroundColor White
Write-Host "  VALKEY_PASSWORD   = $valkeyPassword"   -ForegroundColor White
Write-Host "  CH_PASSWORD       = $chPassword"       -ForegroundColor White
Write-Host "  GRAFANA_PASSWORD  = $grafanaPassword"  -ForegroundColor White
Write-Host ""
Write-Wrn "Сохрани эти значения в менеджер паролей!"
Write-Host ""

# ── проверка: .gitignore включает .env ───────────────────────
if (Test-Path ".gitignore") {
    $gi = Get-Content ".gitignore" -Raw
    if ($gi -notmatch '(?m)^\s*\.env\s*$') {
        Write-Wrn ".env НЕ найден в .gitignore — добавь строку '.env' вручную!"
    } else {
        Write-Ok ".gitignore: .env исключён ✓"
    }
}

# ── следующий шаг ─────────────────────────────────────────────
Write-Host "  ▶  Следующий шаг:" -ForegroundColor Cyan
Write-Host "     pm2 delete all" -ForegroundColor Gray
Write-Host "     pm2 start infra\pm2\ecosystem.config.cjs" -ForegroundColor Gray
Write-Host ""
