// cores/alert-core/src/notification-dispatcher.ts
import type { AlertEvent } from './alert-evaluator.js'
import type { AlertRule, AlertChannel } from './alert-rule.js'
import type { Logger } from '@crypto-platform/logger'

export class NotificationDispatcher {
  constructor(private readonly log: Logger) {}

  async dispatch(event: AlertEvent, rule: AlertRule): Promise<void> {
    for (const ch of rule.channels) await this.send(ch, event, rule)
  }

  private async send(channel: AlertChannel, event: AlertEvent, rule: AlertRule): Promise<void> {
    const msg = `Alert: ${rule.symbol} ${rule.metric} ${event.value.toFixed(4)} (${rule.condition} ${rule.threshold})`
    this.log.info({ channel, event }, msg)
    if (channel === 'telegram' && process.env['TELEGRAM_BOT_TOKEN']) {
      // telegram notification stub – fill in your bot token and chat_id
      this.log.debug('telegram dispatch stub')
    }
    if (channel === 'webhook' && rule.channels.includes('webhook')) {
      this.log.debug('webhook dispatch stub')
    }
  }
}
