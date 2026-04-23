// packages/metrics/src/index.ts
import { collectDefaultMetrics, Registry, Gauge, Counter, Histogram, Summary } from 'prom-client';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Создаем центральный реестр метрик
export const registry = new Registry();

// Включаем сбор стандартных метрик Node.js (CPU, память, сборщик мусора и т.д.)
collectDefaultMetrics({ register: registry });

/**
 * Фабрика для создания Gauge метрик.
 */
export function createGauge(name: string, help: string, labelNames: string[] = []): Gauge<string> {
  return new Gauge({ name, help, labelNames, registers: [registry] });
}

/**
 * Фабрика для создания Counter метрик.
 */
export function createCounter(name: string, help: string, labelNames: string[] = []): Counter<string> {
  return new Counter({ name, help, labelNames, registers: [registry] });
}

/**
 * Фабрика для создания Histogram метрик.
 */
export function createHistogram(
  name: string,
  help: string,
  labelNames: string[] = [],
  buckets?: number[]
): Histogram<string> {
  return new Histogram({ name, help, labelNames, buckets, registers: [registry] });
}

/**
 * Фабрика для создания Summary метрик.
 */
export function createSummary(
  name: string,
  help: string,
  labelNames: string[] = [],
  percentiles?: number[]
): Summary<string> {
  return new Summary({ name, help, labelNames, percentiles, registers: [registry] });
}

// ============================================
// Предопределенные метрики для всей платформы
// ============================================

// --- Orchestrator метрики ---
export const moduleStatusGauge = createGauge(
  'crypto_module_status',
  'Статус модуля: 1=online, 0.5=degraded, 0.25=restarting, 0=offline',
  ['module']
);

export const moduleRestartsCounter = createCounter(
  'crypto_module_restarts_total',
  'Общее количество перезапусков модуля',
  ['module']
);

export const moduleUptimeGauge = createGauge(
  'crypto_module_uptime_seconds',
  'Время работы модуля в секундах',
  ['module']
);

export const activePairsGauge = createGauge(
  'crypto_active_pairs',
  'Количество активных торговых пар'
);

export const activeClientsGauge = createGauge(
  'crypto_active_clients',
  'Количество активных WebSocket клиентов'
);

// --- WS Gateway метрики ---
export const wsConnectionsTotal = createGauge(
  'crypto_ws_connections_total',
  'Текущее количество WebSocket соединений'
);

export const wsMessagesSentCounter = createCounter(
  'crypto_ws_messages_sent_total',
  'Количество отправленных сообщений по каналам',
  ['channel']
);

export const wsSubscriptionsTotal = createGauge(
  'crypto_ws_subscriptions_total',
  'Текущее количество активных подписок'
);

export const wsBackpressureDropsCounter = createCounter(
  'crypto_ws_backpressure_drops',
  'Количество отброшенных сообщений из-за backpressure',
  ['channel']
);

export const wsMessageLatencyHistogram = createHistogram(
  'crypto_ws_message_latency_ms',
  'Задержка доставки сообщения клиенту в миллисекундах',
  ['channel'],
  [1, 5, 10, 25, 50, 100, 250, 500]
);

// --- Exchange Core метрики ---
export const exchangeRequestsCounter = createCounter(
  'crypto_exchange_requests_total',
  'Количество запросов к биржам',
  ['exchange', 'method', 'status']
);

export const exchangeLatencyHistogram = createHistogram(
  'crypto_exchange_latency_ms',
  'Задержка ответа биржи в миллисекундах',
  ['exchange', 'method'],
  [10, 50, 100, 250, 500, 1000, 2000, 5000]
);

export const exchangeErrorsCounter = createCounter(
  'crypto_exchange_errors_total',
  'Количество ошибок при запросах к биржам',
  ['exchange', 'error_type']
);

export const circuitBreakerStateGauge = createGauge(
  'crypto_circuit_breaker_state',
  'Состояние Circuit Breaker: 0=closed, 1=open, 0.5=half_open',
  ['exchange']
);

export const rateLimitRemainingGauge = createGauge(
  'crypto_rate_limit_remaining',
  'Оставшееся количество запросов до срабатывания rate limit',
  ['exchange']
);

// --- Data pipeline метрики ---
export const messagesProcessedCounter = createCounter(
  'crypto_messages_processed_total',
  'Количество обработанных сообщений',
  ['core', 'channel']
);

export const messagesFailedCounter = createCounter(
  'crypto_messages_failed_total',
  'Количество сообщений, обработка которых завершилась ошибкой',
  ['core', 'channel', 'reason']
);

export const processingLatencyHistogram = createHistogram(
  'crypto_processing_latency_ms',
  'Время обработки сообщения в миллисекундах',
  ['core'],
  [1, 5, 10, 25, 50, 100, 250]
);

export const pipelineLagGauge = createGauge(
  'crypto_pipeline_lag_ms',
  'Отставание обработки от биржевого времени в миллисекундах',
  ['core']
);

// ============================================
// HTTP сервер для экспорта метрик
// ============================================
export interface MetricsServer {
  close(): Promise<void>;
}

/**
 * Запускает HTTP сервер с единственным эндпоинтом /metrics для Prometheus.
 * @param port Порт для прослушивания
 * @returns Объект сервера с методом close()
 */
export async function createMetricsServer(port: number): Promise<MetricsServer> {
  const app: FastifyInstance = Fastify({ logger: false });

  app.get('/metrics', async (_, reply) => {
    const metrics = await registry.metrics();
    reply
      .header('Content-Type', 'text/plain; version=0.0.4')
      .send(metrics);
  });

  await app.listen({ port, host: '0.0.0.0' });

  return {
    close: async () => {
      await app.close();
    }
  };
}