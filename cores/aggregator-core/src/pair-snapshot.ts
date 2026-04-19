// cores/aggregator-core/src/pair-snapshot.ts
import type {
  NormalizedCandle,
  NormalizedTicker,
  Timeframe,
} from '@crypto-platform/types';

export interface PairSnapshot {
  symbol: string;
  ticker?: NormalizedTicker;
  candles: Partial<Record<Timeframe, NormalizedCandle>>;
}

export class PairSnapshotStore {
  private tickers = new Map<string, NormalizedTicker>();
  private candles = new Map<string, Partial<Record<Timeframe, NormalizedCandle>>>();

  setTicker(t: NormalizedTicker): void {
    this.tickers.set(t.symbol, t);
  }

  setCandle(c: NormalizedCandle): void {
    const tf = c.tf as Timeframe;
    const cur = this.candles.get(c.symbol) ?? {};
    cur[tf] = c;
    this.candles.set(c.symbol, cur);
  }

  getSnapshot(symbol: string): PairSnapshot {
    return {
      symbol,
      ticker: this.tickers.get(symbol),
      candles: this.candles.get(symbol) ?? {},
    };
  }
}