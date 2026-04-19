# scripts/stop.ps1
pm2 stop all
pm2 delete all
Write-Host "All processes stopped." -ForegroundColor Green
