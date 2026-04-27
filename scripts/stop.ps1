# scripts/stop.ps1
$root = $PSScriptRoot | Split-Path -Parent
Set-Location $root

Write-Host "Останавливаем PM2 процессы..." -ForegroundColor Yellow
pm2 delete all

Write-Host "Останавливаем Docker..." -ForegroundColor Yellow
docker compose down

Write-Host "✅ Всё остановлено." -ForegroundColor Green
