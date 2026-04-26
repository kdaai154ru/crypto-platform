// apps/ws-gateway/src/subscription-handler.ts
import type Valkey from 'iovalkey';
import { ConnectionManager, MAX_SUBSCRIPTIONS_PER_CLIENT } from './connection-manager.js';
import type { Logger } from '@crypto-platform/logger';

/**
 * Broadcast channels — delivered to ALL clients, no symbol required.
 * Names must match ws-gateway CHANNEL_MAP output values (underscore format).
 * Also accept the colon-format aliases sent by some frontends.
 */
const BROADCAST_CHANNELS = new Set([
  // underscore (canonical — what ws-gateway sends as msg.type)
  'system_status',
  'screener_update',
  'options_update',
  'etf_latest',
  'alerts_triggered',
  // colon aliases (legacy / just in case)
  'system:status',
  'screener:update',
  'options:update',
  'etf:latest',
  'alerts:triggered',
  'alerts:trigger',
]);

export class SubscriptionHandler {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly valkey: Valkey,
    private readonly log: Logger
  ) {}

  subscribe(id: string, channels: string[], symbol?: string): void {
    if (!channels || channels.length === 0) return;

    const sym = symbol?.trim();

    const client = this.connectionManager.get(id);
    if (!client) {
      this.log.warn({ clientId: id }, 'Client not found for subscribe');
      return;
    }

    for (const channel of channels) {
      const isBroadcast = BROADCAST_CHANNELS.has(channel);

      // Non-broadcast channels require a symbol
      if (!isBroadcast && !sym) {
        this.log.warn({ clientId: id, channel }, 'subscribe: symbol missing for non-broadcast channel, skipping');
        continue;
      }

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
        if (isBroadcast) {
          this.log.debug({ clientId: id, channel }, 'Registered broadcast channel subscription');
        } else {
          this.valkey.publish(
            'sub:request',
            JSON.stringify({ viewerId: id, channel, symbol: sym })
          ).catch((err: Error) => this.log.error({ err, channel }, 'Failed to publish sub:request'));
        }
      }
    }
  }

  unsubscribe(id: string, channels: string[], symbol?: string): void {
    if (!channels || channels.length === 0) return;

    const client = this.connectionManager.get(id);
    if (!client) return;

    const sym = symbol?.trim();

    for (const channel of channels) {
      this.connectionManager.removeSubscription(id, channel);
      const isBroadcast = BROADCAST_CHANNELS.has(channel);
      if (!isBroadcast && sym) {
        this.valkey.publish(
          'sub:release',
          JSON.stringify({ viewerId: id, channel, symbol: sym })
        ).catch((err: Error) => this.log.error({ err, channel }, 'Failed to publish sub:release'));
      }
    }
  }

  unsubscribeAll(id: string): void {
    const client = this.connectionManager.get(id);
    if (!client) return;

    const channels = Array.from(client.subscriptions);
    for (const channel of channels) {
      this.connectionManager.removeSubscription(id, channel);
      const isBroadcast = BROADCAST_CHANNELS.has(channel);
      if (!isBroadcast) {
        this.valkey.publish(
          'sub:release',
          JSON.stringify({ viewerId: id, channel })
        ).catch((err: Error) => this.log.error({ err, channel }, 'Failed to publish sub:release'));
      }
    }
  }
}
