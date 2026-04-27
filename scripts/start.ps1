# scripts/start.ps1
# Запуск одной командой: .\scripts\start.ps1
# Опционально: .\scripts\start.ps1 -Env development

param(
  [string]$Env = "development"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot | Split-Path -Parent

Write-Host "[1/4] Устанавливаем NODE_ENV=$Env" -ForegroundColor Cyan
$env:NODE_ENV = $Env

Write-Host "[2/4] Запускаем Docker (инфраструктура)..." -ForegroundColor Cyan
Set-Location $root
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Error "docker compose up завершился с ошибкой"; exit 1 }

Write-Host "[3/4] Собираем все пакеты (turbo build)..." -ForegroundColor Cyan
pnpm run build
if ($LASTEXITCODE -ne 0) { Write-Error "pnpm build завершился с ошибкой"; exit 1 }

Write-Host "[4/4] Запускаем PM2..." -ForegroundColor Cyan
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "PM2 не найден, устанавливаем..." -ForegroundColor Yellow
  npm install -g pm2
}

# Останавливаем старые процессы если есть
pm2 delete all 2>$null

if ($Env -eq "development") {
  pm2 start infra/pm2/ecosystem.config.cjs --env development
} else {
  pm2 start infra/pm2/ecosystem.config.cjs
}

pm2 save
pm2 status

Write-Host "`n✅ Платформа запущена!" -ForegroundColor Green
Write-Host "   Frontend : http://localhost" -ForegroundColor White
Write-Host "   Grafana  : http://localhost:3100" -ForegroundColor White
Write-Host "   Prometheus: http://localhost:9090" -ForegroundColor White
