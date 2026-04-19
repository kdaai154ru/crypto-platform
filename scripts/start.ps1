# scripts/start.ps1
Write-Host "Building backend..." -ForegroundColor Cyan
pnpm build
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { npm install -g pm2 }
pm2 start infra/pm2/ecosystem.config.cjs
pm2 status
Write-Host "Backend started." -ForegroundColor Green
Write-Host "Run `cd apps/frontend && pnpm dev` for frontend." -ForegroundColor Yellow
