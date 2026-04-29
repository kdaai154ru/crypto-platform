# ============================================================
# start-all.ps1  --  Full launch of crypto-platform (Windows)
# ============================================================
# Usage:
#   Normal start:     .\start-all.ps1
#   Full clean start: .\start-all.ps1 -Clean
#   Skip git pull:    .\start-all.ps1 -SkipGit
#   Dev mode:         .\start-all.ps1 -Env development
# ============================================================
param(
  [switch]$Clean,
  [switch]$SkipGit,
  [string]$Env = "development"
)

# Git writes info/progress to stderr — with Stop that triggers NativeCommandError
$ErrorActionPreference = "Continue"

$ROOT = $PSScriptRoot
Set-Location $ROOT

function Write-Step { param($n, $text) Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-OK   { param($text)     Write-Host "  OK: $text" -ForegroundColor Green }
function Write-Warn { param($text)     Write-Host "  WARN: $text" -ForegroundColor Yellow }
function Write-Fail {
  param($text)
  Write-Host "`n  ERR: $text" -ForegroundColor Red
  Write-Host "  Tip: run 'pm2 logs --lines 50' or 'docker logs <container> --tail 50'" -ForegroundColor DarkGray
  exit 1
}

function Invoke-Git {
  param([string[]]$GitArgs)
  $result = & git @GitArgs 2>$null
  return $result
}

# FIX: pm2 delete all prints [WARN] No process found to stderr when there are
# no running processes, which PowerShell treats as NativeCommandError.
# Wrapping in try/catch with 2>$null suppresses the false-positive error.
function Invoke-PM2DeleteAll {
  try {
    $out = & pm2 delete all 2>&1
    # Only show output if it's a real error (not the expected "No process found" warn)
    if ($out -and ($out -notmatch "No process found")) {
      Write-Host ($out | Out-String).Trim() -ForegroundColor DarkGray
    }
  } catch {
    # Intentionally ignored — "No process found" is not an error
  }
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

# ============================================================
# STEP 0 — Check system dependencies
# ============================================================
Write-Step "0" "Checking system dependencies..."
Write-Host "  Working directory: $ROOT" -ForegroundColor Gray

foreach ($cmd in @("docker", "node")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Fail "'$cmd' not found in PATH. Install it and re-run."
  }
}

# Node.js version check — require >= 22
$nodeVer = (& node --version 2>$null) -replace 'v',''
$nodeMajor = [int]($nodeVer -split '\.')[0]
if ($nodeMajor -lt 22) {
  Write-Fail "Node.js >= 22 required (found v$nodeVer). Install from https://nodejs.org"
}
Write-OK "Node.js v$nodeVer"

# pnpm check + version
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Warn "pnpm not found, installing via npm..."
  npm install -g pnpm@10.33.0
  if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to install pnpm" }
}
$pnpmVer = (& pnpm --version 2>$null)
Write-OK "pnpm v$pnpmVer"

# pm2 check
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Warn "pm2 not found, installing globally..."
  npm install -g pm2
  if ($LASTEXITCODE -ne 0) { Write-Fail "npm install -g pm2 failed" }
}
Write-OK "docker, node, pnpm, pm2 found"

# ============================================================
# STEP 0b — Check .env
# ============================================================
if (-not (Test-Path (Join-Path $ROOT ".env"))) {
  Write-Warn ".env not found, copying from .env.example..."
  Copy-Item (Join-Path $ROOT ".env.example") (Join-Path $ROOT ".env")
  Write-Host "  ACTION REQUIRED: edit .env — set JWT_SECRET, POSTGRES_PASSWORD etc." -ForegroundColor Red
  Write-Host "  Then run this script again." -ForegroundColor Yellow
  exit 1
}

# Validate JWT_SECRET length
$jwtLine = Select-String -Path (Join-Path $ROOT ".env") -Pattern "^JWT_SECRET=(.+)" | Select-Object -First 1
if (-not $jwtLine -or $jwtLine.Matches[0].Groups[1].Value.Trim() -eq "REPLACE_THIS_WITH_OPENSSL_RAND_HEX_32") {
  Write-Fail "JWT_SECRET in .env is not set or still placeholder. Generate: openssl rand -hex 32"
}
Write-OK ".env valid"

# ============================================================
# STEP 1 — Stop old PM2 processes
# ============================================================
Write-Step "1" "Stopping old PM2 processes..."
Invoke-PM2DeleteAll
Write-OK "PM2 cleared"

# ============================================================
# STEP 2 — Deep cache + artifact cleanup (-Clean mode)
# ============================================================
if ($Clean) {
  Write-Step "2" "Deep clean: removing all build artifacts, caches, node_modules..."

  # Turbo cache
  $turboCache = Join-Path $ROOT ".turbo"
  if (Test-Path $turboCache) { Remove-Item -Recurse -Force $turboCache; Write-OK ".turbo cache removed" }

  # pnpm store cleanup
  & pnpm store prune 2>$null | Out-Null
  Write-OK "pnpm store pruned"

  # Remove node_modules everywhere
  Get-ChildItem -Path $ROOT -Filter "node_modules" -Recurse -Directory -Force `
    | Where-Object { $_.FullName -notmatch '\\.git' } `
    | ForEach-Object {
        Write-Host "  Removing $($_.FullName)" -ForegroundColor DarkGray
        Remove-Item -Recurse -Force $_.FullName
      }
  Write-OK "node_modules removed"

  # Remove all dist/build outputs
  $buildDirs = @(".output", "dist", ".nuxt", ".next")
  Get-ChildItem -Path $ROOT -Recurse -Directory -Force `
    | Where-Object { $buildDirs -contains $_.Name -and $_.FullName -notmatch '\\.git' } `
    | ForEach-Object {
        Write-Host "  Removing $($_.FullName)" -ForegroundColor DarkGray
        Remove-Item -Recurse -Force $_.FullName
      }
  Write-OK "dist/.output/.nuxt removed"

  # PM2 home logs
  $pm2Logs = Join-Path $env:USERPROFILE ".pm2\logs"
  if (Test-Path $pm2Logs) { Remove-Item -Recurse -Force $pm2Logs; Write-OK "PM2 logs cleared" }

  # Project logs dir
  $logsDir = Join-Path $ROOT "logs"
  if (Test-Path $logsDir) { Remove-Item -Recurse -Force $logsDir; Write-OK "Project logs cleared" }

  # Docker volumes
  Write-Warn "Removing Docker volumes (all data will be lost)..."
  & docker compose down -v 2>$null | Out-Null
  Write-OK "Docker volumes removed"
}

# ============================================================
# STEP 3 — Ensure logs directory exists
# ============================================================
$logsDir = Join-Path $ROOT "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

# ============================================================
# STEP 4 — Git pull (safe, skip with -SkipGit)
# ============================================================
Write-Step "4" "Updating code from git..."
if ($SkipGit) {
  Write-Warn "-SkipGit: skipping git pull"
} else {
  $dirty = Invoke-Git @("status", "--porcelain")
  if ($dirty) {
    Write-Warn "Local changes detected — stashing..."
    Invoke-Git @("stash", "push", "-m", "auto-stash $(Get-Date -Format 'yyyyMMdd-HHmmss')")
    $wasStashed = $true
  } else {
    $wasStashed = $false
  }
  Invoke-Git @("fetch", "origin", "main")
  Invoke-Git @("reset", "--hard", "origin/main")
  if ($wasStashed) {
    Write-Warn "Restoring stash..."
    Invoke-Git @("stash", "pop") | Out-Null
  }
  Write-OK "Code updated to origin/main"
}

# ============================================================
# STEP 5 — Docker infrastructure
# ============================================================
Write-Step "5" "Starting Docker infrastructure..."
& docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed — check docker-compose.yml and .env" }
Write-OK "Containers started, waiting for healthchecks..."

Wait-Docker "crypto-postgres"   "PostgreSQL"  60
Wait-Docker "crypto-valkey"     "Valkey"       60
Wait-Docker "crypto-clickhouse" "ClickHouse"  120
Write-OK "Infrastructure ready"

# ============================================================
# STEP 6 — DB Migrations (idempotent: IF NOT EXISTS)
# ============================================================
Write-Step "6" "Running DB migrations..."

$pgMigration = Join-Path $ROOT "infra/migrations/postgres/001_initial.sql"
if (-not (Test-Path $pgMigration)) {
  Write-Warn "PostgreSQL migration file not found at $pgMigration, skipping"
} else {
  Write-Host "  PostgreSQL..."
  Get-Content $pgMigration | docker compose exec -T postgres psql -U crypto -d crypto
  if ($LASTEXITCODE -ne 0) { Write-Fail "PostgreSQL migration failed" }
  Write-OK "PostgreSQL migration done"
}

$chMigration = Join-Path $ROOT "infra/migrations/clickhouse/001_initial.sql"
if (-not (Test-Path $chMigration)) {
  Write-Warn "ClickHouse migration file not found at $chMigration, skipping"
} else {
  Write-Host "  ClickHouse..."
  $chPass = ""
  $chLine = Select-String -Path (Join-Path $ROOT ".env") -Pattern "^CLICKHOUSE_PASSWORD=(.*)" | Select-Object -First 1
  if ($chLine) { $chPass = $chLine.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'") }
  Get-Content $chMigration | docker compose exec -T clickhouse clickhouse-client `
    --user default --password "$chPass" --multiquery
  if ($LASTEXITCODE -ne 0) { Write-Fail "ClickHouse migration failed" }
  Write-OK "ClickHouse migration done"
}

# ============================================================
# STEP 7 — Install dependencies
# ============================================================
Write-Step "7" "Installing dependencies..."
& pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) {
  Write-Warn "--frozen-lockfile failed, trying without..."
  & pnpm install
  if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm install failed" }
}
Write-OK "Dependencies installed"

# ============================================================
# STEP 8 — Build
# ============================================================
Write-Step "8" "Building project..."
$env:NODE_ENV = if ($Env -eq "development") { "development" } else { "production" }
& pnpm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm build failed — check TypeScript errors above" }
Write-OK "Build complete (NODE_ENV=$($env:NODE_ENV))"

# ============================================================
# STEP 9 — Start PM2
# ============================================================
Write-Step "9" "Starting all services via PM2..."

# Load .env into process environment so ecosystem.config.cjs can read vars
Get-Content (Join-Path $ROOT ".env") | ForEach-Object {
  if ($_ -match '^([^#][^=]*)=(.*)$') {
    $k = $Matches[1].Trim()
    $v = $Matches[2].Trim().Trim('"').Trim("'")
    if ($k -and -not [string]::IsNullOrWhiteSpace($k)) {
      [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
  }
}

$ecosystemPath = Join-Path $ROOT "infra/pm2/ecosystem.config.cjs"
if ($Env -eq "development") {
  & pm2 start $ecosystemPath --env development
} else {
  & pm2 start $ecosystemPath
}
if ($LASTEXITCODE -ne 0) { Write-Fail "PM2 start failed — check infra/pm2/ecosystem.config.cjs" }
& pm2 save
Start-Sleep 6
& pm2 status

# ============================================================
# DONE
# ============================================================
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  crypto-platform is RUNNING!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Frontend      http://localhost:3001" -ForegroundColor White
Write-Host "  Orchestrator  http://localhost:3010" -ForegroundColor White
Write-Host "  WS Gateway    ws://localhost:4000" -ForegroundColor White
Write-Host "  Grafana       http://localhost:3100" -ForegroundColor White
Write-Host "  Prometheus    http://localhost:9090" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Logs:         pm2 logs" -ForegroundColor Gray
Write-Host "  Restart one:  pm2 restart <name>" -ForegroundColor Gray
Write-Host "  Stop all:     pm2 delete all; docker compose down" -ForegroundColor Gray
Write-Host "  Full reset:   .\start-all.ps1 -Clean" -ForegroundColor Gray
