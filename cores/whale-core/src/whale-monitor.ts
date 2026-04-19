// cores/whale-core/src/whale-monitor.ts
import type { NormalizedTrade } from '@crypto-platform/types';

export interface WhaleEvent {
  trade: NormalizedTrade;
  tier: 'large' | 'xlarge' | 'mega';
}

type WhaleTier = 'large' | 'xlarge' | 'mega';

export class WhaleMonitor {
  private events: WhaleEvent[] = [];

  process(trade: NormalizedTrade): WhaleEvent | null {
    if (trade.usdValue < 100_000) return null;

    const tier: WhaleTier =
      trade.usdValue >= 1_000_000 ? 'mega' :
      trade.usdValue >= 500_000   ? 'xlarge' :
                                    'large';

    const ev: WhaleEvent = { trade, tier };
    this.events.push(ev);
    if (this.events.length > 200) this.events.shift();
    return ev;
  }

  recent(limit = 50): WhaleEvent[] {
    return this.events.slice(-limit);
  }
}