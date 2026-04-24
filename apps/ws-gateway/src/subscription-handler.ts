// apps/ws-gateway/src/subscription-handler.ts
import type Valkey from 'iovalkey';
import { ConnectionManager, MAX_SUBSCRIPTIONS_PER_CLIENT } from './connection-manager.js';
import type { Logger } from '@crypto-platform/logger';

export class SubscriptionHandler {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly valkey: Valkey,
    private readonly log: Logger
  ) {}

  /**
   * Подписывает клиента на указанные каналы.
   * Если каналы не указаны, подписка отменяется.
   * Лимит подписок на клиента: MAX_SUBSCRIPTIONS_PER_CLIENT (50).
   */
  subscribe(id: string, channels: string[], symbol?: string): void {
    if (!channels || channels.length === 0) return;

    const client = this.connectionManager.get(id);
    if (!client) {
      this.log.warn({ clientId: id }, 'Client not found for subscribe');
      return;
    }

    for (const channel of channels) {
      const currentCount = this.connectionManager.subscriptionCount(id);
      if (currentCount >= MAX_SUBSCRIPTIONS_PER_CLIENT) {
        this.log.warn(
          { clientId: id, channel, currentCount },
          'Subscription limit reached, skipping channel'
        );
        continue;
      }

      const added = this.connectionManager.addSubscription(id, channel);
      if (added) {
        this.valkey.publish(
          'sub:request',
          JSON.stringify({
            clientId: id,
            channel,
            symbol,
          })
        ).catch((err: Error) => this.log.error({ err, channel }, 'Failed to publish sub:request'));
      }
    }
  }

  /**
   * Отписывает клиента от указанных каналов.
   */
  unsubscribe(id: string, channels: string[], symbol?: string): void {
    if (!channels || channels.length === 0) return;

    const client = this.connectionManager.get(id);
    if (!client) return;

    for (const channel of channels) {
      this.connectionManager.removeSubscription(id, channel);
      this.valkey.publish(
        'sub:release',
        JSON.stringify({
          clientId: id,
          channel,
          symbol,
        })
      ).catch((err: Error) => this.log.error({ err, channel }, 'Failed to publish sub:release'));
    }
  }

  /**
   * Отписывает клиента от всех каналов (при дисконнекте).
   */
  unsubscribeAll(id: string): void {
    const client = this.connectionManager.get(id);
    if (!client) return;

    const channels = Array.from(client.subscriptions);
    for (const channel of channels) {
      this.connectionManager.removeSubscription(id, channel);
      this.valkey.publish(
        'sub:release',
        JSON.stringify({
          clientId: id,
          channel,
        })
      ).catch((err: Error) => this.log.error({ err, channel }, 'Failed to publish sub:release'));
    }
  }
}