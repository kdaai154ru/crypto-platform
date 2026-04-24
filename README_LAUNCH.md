Запуск проекта
Предварительные требования
Node.js 20+

pnpm 10+

Docker Desktop (для инфраструктуры)

PM2 глобально: npm i -g pm2

1. Настройка окружения
bash
# Скопировать .env.example в .env и заполнить
cp .env.example .env
Обязательно задать в .env:

text
JWT_SECRET=минимум_32_символа_случайная_строка
PG_PASSWORD=ваш_пароль
VALKEY_PASSWORD=       # оставить пустым если без пароля
2. Запустить инфраструктуру (Docker)
bash
pnpm infra:up
# или напрямую:
docker compose -f infra/docker/docker-compose.yml up -d
Проверить что всё запустилось:

bash
docker compose -f infra/docker/docker-compose.yml ps
Доступно после запуска:

Сервис	URL
Valkey	localhost:6379
PostgreSQL	localhost:5432
ClickHouse	http://localhost:8123
Prometheus	http://localhost:9090
Grafana	http://localhost:3100
3. DEV режим (разработка) — всё вместе
bash
# Установить зависимости
pnpm install

# Запустить ВСЕ сервисы (бэк + фронт) через turbo
pnpm dev
Или раздельно:

bash
pnpm dev:back    # только бэкенд (orchestrator + ws-gateway + все cores)
pnpm dev:front   # только фронтенд (Nuxt на :3001)
Доступно в dev:

Сервис	URL
Frontend	http://localhost:3001
Orchestrator	http://localhost:3010
WS Gateway	ws://localhost:4000
Metrics	http://localhost:3001/metrics (orchestrator)
4. PROD режим — PM2
bash
# 1. Сначала собрать ВСЁ
pnpm build

# 2. Запустить через PM2
pnpm start:all

# Статус всех процессов
pnpm status

# Логи
pnpm logs

# Остановить всё
pnpm stop:all
5. Полный перезапуск (dev)
bash
# Остановить PM2
pnpm stop:all

# Инфраструктура вниз
pnpm infra:down

# Инфраструктура вверх
pnpm infra:up

# Запустить dev
pnpm dev
Структура портов
Сервис	Порт	Протокол
Сервис	Порт	Протокол
Frontend (Nuxt)	3001	HTTP
Orchestrator API	3010	HTTP
Orchestrator Metrics	3001	HTTP /metrics
WS Gateway	4000	WebSocket
WS Gateway Metrics	4001	HTTP /metrics
Exchange Core	4002	HTTP /metrics
Normalizer Core	4003	HTTP /metrics
Aggregator Core	4004	HTTP /metrics
Trades Core	4005	HTTP /metrics
Indicator Core	4006	HTTP /metrics
Screener Core	4007	HTTP /metrics
Alert Core	4008	HTTP /metrics
Derivatives Core	4009	HTTP /metrics
Whale Core	4010	HTTP /metrics
ETF Core	4011	HTTP /metrics
Options Core	4012	HTTP /metrics
Storage Core	4013	HTTP /metrics
Worker Core	4014	HTTP /metrics
Valkey	6379	TCP
PostgreSQL	5432	TCP
ClickHouse HTTP	8123	HTTP
ClickHouse Native	9000	TCP
Prometheus	9090	HTTP
Grafana	3100	HTTP