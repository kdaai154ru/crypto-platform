// apps/ws-gateway/src/valkey-fanout.ts
import Valkey from 'iovalkey';
import type { ConnectionManager, WsClient } from './connection-manager.js';
import { UWS_SEND_BACKPRESSURE, UWS_SEND_DROPPED } from './connection-manager.js';
import type { Logger } from '@crypto-platform/logger';
import {
  wsMessagesSentCounter,
  wsBackpressureDropsCounter,
  wsMessageLatencyHistogram,
} from '@crypto-platform/metrics';

/**
 * Маппинг Valkey Pub/Sub каналов на клиентские WebSocket каналы.
 * Ключ — канал в Valkey, значение — канал, который отправляется клиенту.
 */
const CHANNEL_MAP: Record<string, string> = {
  'agg:ticker': 'ticker',
  'agg:candle': 'candle',
  'trades:stream': 'trades',
  'trades:large': 'trades_large',
  'trades:delta': 'trades_delta',
  'deriv:oi': 'deriv_oi',
  'deriv:fund': 'deriv_fund',
  'deriv:liq': 'deriv_liq',
  'whale:event': 'whale_event',
  'screener:update': 'screener_update',
  'options:update': 'options_update',
  'etf:latest': 'etf_latest',
  'system:status': 'system_status',
};

/**
 * Список всех каналов, на которые подписывается ValkeyFanout.
 */
const SUBSCRIBE_CHANNELS = Object.keys(CHANNEL_MAP);

export class ValkeyFanout {
  private subscriber: Valkey;
  private isRunning = true;
  private logger: Logger;

  constructor(
    valkeyOpts: { host: string; port: number },
    private readonly connectionManager: ConnectionManager,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'ValkeyFanout' });
    this.subscriber = new Valkey(valkeyOpts);

    this.subscriber.on('error', (err: Error) => {
      this.logger.error({ err }, 'Valkey subscriber error');
    });

    this.subscriber.on('ready', () => {
      this.logger.info('Valkey subscriber ready, subscribing to channels');
      this.subscriber.subscribe(...SUBSCRIBE_CHANNELS);
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      if (!this.isRunning) return;
      this.handleMessage(channel, message).catch((err) => {
        this.logger.error({ err, channel }, 'Error handling Valkey message');
      });
    });
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    const wsChannel = CHANNEL_MAP[channel];
    if (!wsChannel) {
      this.logger.warn({ channel }, 'Unknown Valkey channel');
      return;
    }

    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      this.logger.warn({ channel }, 'Failed to parse message as JSON');
      return;
    }

    const clients = this.connectionManager.getByChannel(wsChannel);
    if (clients.length === 0) return;

    const payload = JSON.stringify({
      type: wsChannel,
      data,
    });

    const now = Date.now();
    const messageTs = data?.ts ? new Date(data.ts).getTime() : undefined;

    for (const client of clients) {
      // Пропускаем клиента, если ws уже не активен
      if (!client.ws) continue;

      const sendResult = client.ws.send(payload);

      if (sendResult === UWS_SEND_BACKPRESSURE || sendResult === UWS_SEND_DROPPED) {
        // Инкремент метрики backpressure drops
        wsBackpressureDropsCounter.inc({ channel: wsChannel });
        this.logger.debug(
          { clientId: client.id, channel: wsChannel, result: sendResult },
          'Message dropped due to backpressure'
        );
      } else {
        // Успешная отправка
        wsMessagesSentCounter.inc({ channel: wsChannel });

        // Измерение задержки доставки, если есть поле ts в данных
        if (messageTs) {
          const latencyMs = now - messageTs;
          if (latencyMs >= 0) {
            wsMessageLatencyHistogram.observe({ channel: wsChannel }, latencyMs);
          }
        }
      }

      // Обновляем время последней активности клиента
      this.connectionManager.updatePing(client.id);
    }
  }

  /**
   * Закрывает подписки и соединение с Valkey.
   */
  close(): void {
    this.isRunning = false;
    try {
      this.subscriber.unsubscribe(...SUBSCRIBE_CHANNELS);
      this.subscriber.quit();
      this.logger.info('Valkey subscriber closed');
    } catch (err) {
      this.logger.error({ err }, 'Error closing Valkey subscriber');
    }
  }
}