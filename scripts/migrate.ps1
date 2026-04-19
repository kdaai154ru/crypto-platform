# scripts/migrate.ps1
$Compose = "infra/docker/docker-compose.yml"
Write-Host "PostgreSQL migrations..." -ForegroundColor Cyan
Get-Content "infra/migrations/postgres/001_initial.sql" |
  docker compose -f $Compose exec -T postgres psql -U crypto -d crypto
Write-Host "ClickHouse migrations..." -ForegroundColor Cyan
Get-Content "infra/migrations/clickhouse/001_initial.sql" |
  docker compose -f $Compose exec -T clickhouse clickhouse-client --multiquery
Write-Host "Done!" -ForegroundColor Green
