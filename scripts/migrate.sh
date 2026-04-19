#!/bin/bash
# scripts/migrate.sh
set -e
COMPOSE="infra/docker/docker-compose.yml"
echo "PostgreSQL migrations..."
docker compose -f $COMPOSE exec -T postgres psql -U crypto -d crypto < infra/migrations/postgres/001_initial.sql
echo "ClickHouse migrations..."
docker compose -f $COMPOSE exec -T clickhouse clickhouse-client --multiquery < infra/migrations/clickhouse/001_initial.sql
echo "Done!"
