// apps/orchestrator/tests/health-monitor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitor } from '../src/health-monitor.js';
import type { ModuleRegistry } from '../src/module-registry.js';
import type Valkey from 'iovalkey';
import type { Logger } from '@crypto-platform/logger';

// Mock Valkey
const mockValkey = {
  get: vi.fn(),
  publish: vi.fn().mockResolvedValue(undefined),
};

// Mock ModuleRegistry
const mockRegistry = {
  all: vi.fn(),
  heartbeat: vi.fn(),
  tick: vi.fn(),
};

// Mock Logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;
  let onStatusChange: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    onStatusChange = vi.fn();
    mockRegistry.all.mockReturnValue([
      { id: 'exchange-core', status: 'online', lastHeartbeat: Date.now(), restarts: 0, uptimeMs: 0, startedAt: 0 },
      { id: 'normalizer-core', status: 'offline', lastHeartbeat: 0, restarts: 0, uptimeMs: 0, startedAt: 0 },
    ]);
    mockValkey.get.mockReset();
    mockValkey.publish.mockClear();
    mockRegistry.heartbeat.mockClear();
    mockRegistry.tick.mockClear();
    monitor = new HealthMonitor(
      mockRegistry as unknown as ModuleRegistry,
      mockValkey as unknown as Valkey,
      onStatusChange,
      mockLogger as unknown as Logger
    );
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  it('start() запускает интервал', () => {
    expect(monitor.isRunning()).toBe(false);
    monitor.start();
    expect(monitor.isRunning()).toBe(true);
  });

  it('при наличии heartbeat в Redis вызывает registry.heartbeat(id) с данными', async () => {
    const heartbeatPayload = { ts: Date.now(), error: undefined };
    mockValkey.get.mockResolvedValue(JSON.stringify(heartbeatPayload));

    monitor.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockValkey.get).toHaveBeenCalledWith('heartbeat:exchange-core');
    expect(mockValkey.get).toHaveBeenCalledWith('heartbeat:normalizer-core');
    expect(mockRegistry.heartbeat).toHaveBeenCalledWith('exchange-core', undefined);
    expect(mockRegistry.heartbeat).toHaveBeenCalledWith('normalizer-core', undefined);
  });

  it('парсит heartbeat с полем error и передаёт его в registry.heartbeat', async () => {
    const heartbeatWithError = { ts: Date.now(), error: 'Connection timeout' };
    mockValkey.get.mockResolvedValue(JSON.stringify(heartbeatWithError));

    monitor.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockRegistry.heartbeat).toHaveBeenCalledWith('exchange-core', 'Connection timeout');
  });

  it('обрабатывает не-JSON значения как ts без error', async () => {
    mockValkey.get.mockResolvedValue(Date.now().toString());

    monitor.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockRegistry.heartbeat).toHaveBeenCalledWith('exchange-core', undefined);
  });

  it('при ошибке valkey.get() не падает, логирует ошибку', async () => {
    const error = new Error('Valkey connection refused');
    mockValkey.get.mockRejectedValue(error);

    monitor.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'exchange-core', err: error }),
      'Failed to process heartbeat for module'
    );
    // Реестр не должен получать heartbeat для этого модуля
    expect(mockRegistry.heartbeat).not.toHaveBeenCalledWith('exchange-core', expect.anything());
    // Но tick всё равно вызывается
    expect(mockRegistry.tick).toHaveBeenCalled();
  });

  it('stop() останавливает интервал', () => {
    monitor.start();
    expect(monitor.isRunning()).toBe(true);
    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  it('overlap protection: если предыдущий тик ещё выполняется, новый тик пропускается', async () => {
    // Создаём долгий промис для valkey.get
    let resolveGet: (value: string) => void;
    const getPromise = new Promise<string>((resolve) => {
      resolveGet = resolve;
    });
    mockValkey.get.mockReturnValue(getPromise);

    monitor.start();
    // Первый тик стартует и зависает на getPromise
    vi.advanceTimersByTime(5000);
    expect(mockValkey.get).toHaveBeenCalledTimes(2); // два модуля

    // Второй тик должен пропуститься из-за isTicking = true
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockLogger.warn).toHaveBeenCalledWith('HealthMonitor tick skipped due to overlap');

    // Завершаем первый тик
    resolveGet!(JSON.stringify({ ts: Date.now() }));
    await vi.runAllTimersAsync();

    // После завершения первого тика следующие тики должны работать
    mockValkey.get.mockResolvedValue(JSON.stringify({ ts: Date.now() }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockValkey.get).toHaveBeenCalledTimes(6); // ещё +2 вызова
  });

  it('вызывает onStatusChange после tick', async () => {
    mockValkey.get.mockResolvedValue(JSON.stringify({ ts: Date.now() }));
    monitor.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onStatusChange).toHaveBeenCalled();
  });

  it('публикует событие module:online при переходе статуса в online', async () => {
    mockValkey.get.mockResolvedValue(JSON.stringify({ ts: Date.now() }));
    // Симулируем, что модуль был offline, а стал online
    mockRegistry.all.mockReturnValue([
      { id: 'exchange-core', status: 'online', lastHeartbeat: Date.now(), restarts: 0, uptimeMs: 0, startedAt: 0 },
    ]);

    monitor.start();
    await vi.advanceTimersByTimeAsync(5000);

    // Первый вызов установит prevStatus в online
    // Второй тик проверит переход
    await vi.advanceTimersByTimeAsync(5000);

    // Проверяем что publish был вызван хотя бы один раз (при первом переходе)
    // Но т.к. prevStatus изначально пуст, первый тик должен опубликовать событие
    expect(mockValkey.publish).toHaveBeenCalledWith(
      'module:online',
      JSON.stringify({ id: 'exchange-core' })
    );
  });
});