# ============================================================
# start-all.ps1  --  Full launch of crypto-platform (Windows)
# Run: .\start-all.ps1
# Full reset: .\start-all.ps1 -Clean
# ============================================================
param(
  [switch]$Clean,
  [string]$Env = "development"
)

# Git stderr in PowerShell causes NativeCommandError with Stop preference
# Use Continue so git info messages don't abort the script
$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT

function Write-Step { param($n, $text) Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-OK   { param($text)     Write-Host "  OK: $text" -ForegroundColor Green }
function Write-Fail { param($text)     Write-Host "`n  ERR: $text" -ForegroundColor Red; exit 1 }

function Invoke-Git {
  # Runs git and discards stderr (git writes progress/info to stderr)
  param([string[]]$Args)
  $result = & git @Args 2>$null
  return $result
}

function Wait-Docker {
  param($container, $label, $timeoutSec = 90)
  Write-Host "  Waiting $label" -NoNewline
  $elapsed = 0
  while ($elapsed -lt $timeoutSec) {
    $status  = (& docker inspect --format "{{.State.Health.Status}}" $container 2>$null) -join ""
    $running = (& docker inspect --format "{{.State.Running}}" $container 2>$null) -join ""
    $health  = (& docker inspect --format "{{.State.Health}}"  $container 2>$null) -join ""
    if ($status -eq "healthy") {
      Write-Host " [healthy]" -ForegroundColor Green; return
    }
    if ($running -eq "true" -and [string]::IsNullOrWhiteSpace($health)) {
      Write-Host " [running]" -ForegroundColor Yellow; return
    }
    Write-Host -NoNewline "."
    Start-Sleep 3
    $elapsed += 3
  }
  Write-Host " TIMEOUT" -ForegroundColor Red
  Write-Fail "$container not healthy after ${timeoutSec}s. Check: docker logs $container --tail 50"
}

# -- 0. Check dependencies -----------------------------------
Write-Step "0" "Checking dependencies..."
foreach ($cmd in @("docker","pnpm","node")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Fail "$cmd not found in PATH"
  }
}
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "  pm2 not found, installing globally..." -ForegroundColor Yellow
  npm install -g pm2
  if ($LASTEXITCODE -ne 0) { Write-Fail "npm install -g pm2 failed" }
}
Write-OK "docker, node, pnpm, pm2 found"

# -- 0b. Check .env ------------------------------------------
if (-not (Test-Path ".env")) {
  Write-Host "  .env not found! Copying from .env.example..." -ForegroundColor Yellow
  Copy-Item ".env.example" ".env"
  Write-Host "  Edit .env (set JWT_SECRET, PG_PASSWORD, etc), then run again." -ForegroundColor Yellow
  exit 1
}
Write-OK ".env found"

# -- 1. Stop old PM2 processes -------------------------------
Write-Step "1" "Stopping old PM2 processes..."
& pm2 delete all 2>$null | Out-Null
Write-OK "PM2 cleared"

# -- 2. Git pull (safe) --------------------------------------
Write-Step "2" "Updating code from git..."

$dirty = Invoke-Git @("status", "--porcelain")
if ($dirty) {
  Write-Host "  Local changes detected. Stashing..." -ForegroundColor Yellow
  Invoke-Git @("stash", "push", "-m", "auto-stash before start-all $(Get-Date -Format 'yyyyMMdd-HHmmss')")
  $wasStashed = $true
} else {
  $wasStashed = $false
}

Invoke-Git @("fetch", "origin", "main")
Invoke-Git @("reset", "--hard", "origin/main")

if ($wasStashed) {
  Write-Host "  Restoring stash..." -ForegroundColor Yellow
  Invoke-Git @("stash", "pop") | Out-Null
}
Write-OK "Code updated"

# -- 3. Docker infrastructure --------------------------------
Write-Step "3" "Starting Docker infrastructure..."

if ($Clean) {
  Write-Host "  -Clean: removing volumes..." -ForegroundColor Yellow
  & docker compose down -v 2>$null | Out-Null
}

& docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed" }
Write-OK "Containers started. Waiting for healthchecks..."

Wait-Docker "crypto-postgres"   "PostgreSQL"  60
Wait-Docker "crypto-valkey"     "Valkey"       60
Wait-Docker "crypto-clickhouse" "ClickHouse"  120
Write-OK "Infrastructure ready"

# -- 4. DB Migrations ----------------------------------------
Write-Step "4" "Running DB migrations..."

Write-Host "  PostgreSQL..."
Get-Content "infra/migrations/postgres/001_initial.sql" |
  docker compose exec -T postgres psql -U crypto -d crypto
if ($LASTEXITCODE -ne 0) { Write-Fail "PostgreSQL migration failed" }

Write-Host "  ClickHouse..."
$chPass = ""
$chLine = Select-String -Path ".env" -Pattern "^CLICKHOUSE_PASSWORD=(.*)" | Select-Object -First 1
if ($chLine) {
  $chPass = $chLine.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
}
Get-Content "infra/migrations/clickhouse/001_initial.sql" |
  docker compose exec -T clickhouse clickhouse-client `
    --user default `
    --password "$chPass" `
    --multiquery
if ($LASTEXITCODE -ne 0) { Write-Fail "ClickHouse migration failed" }
Write-OK "Migrations applied"

# -- 5. Install dependencies ---------------------------------
Write-Step "5" "Installing dependencies (pnpm install)..."
& pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm install failed" }
Write-OK "Dependencies installed"

# -- 6. Build ------------------------------------------------
Write-Step "6" "Building project (pnpm build)..."
$env:NODE_ENV = "production"
& pnpm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm build failed" }
Write-OK "Build complete"

# -- 7. PM2 start --------------------------------------------
Write-Step "7" "Starting all services via PM2..."
& pm2 start infra/pm2/ecosystem.config.cjs
if ($LASTEXITCODE -ne 0) { Write-Fail "PM2 start failed" }
& pm2 save
Start-Sleep 5
& pm2 status

# -- Done ----------------------------------------------------
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  crypto-platform is RUNNING!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Frontend      http://localhost:3001" -ForegroundColor White
Write-Host "  Orchestrator  http://localhost:3010" -ForegroundColor White
Write-Host "  WS Gateway    ws://localhost:4000" -ForegroundColor White
Write-Host "  Grafana       http://localhost:3100" -ForegroundColor White
Write-Host "  Prometheus    http://localhost:9090" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Logs: pm2 logs" -ForegroundColor Gray
Write-Host "  Stop: pm2 delete all; docker compose down" -ForegroundColor Gray
