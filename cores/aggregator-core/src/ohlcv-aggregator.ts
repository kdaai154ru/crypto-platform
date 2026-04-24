// cores/aggregator-core/src/ohlcv-aggregator.ts
import type { NormalizedCandle, Timeframe } from '@crypto-platform/types';

interface CandleState {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ts: number;
}

const TF_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
};

export class OHLCVAggregator {
  private states = new Map<string, CandleState>();

  process(candle: NormalizedCandle): NormalizedCandle {
    const tf = candle.tf as Timeframe;

    // FIX #24: защита от неизвестного таймфрейма — TF_MS[tf] вернёт undefined → NaN bucket
    const tfMs = TF_MS[tf];
    if (!tfMs) {
      // возвращаем свечу as-is, не агрегируем
      return candle;
    }

    const key = `${candle.symbol}:${candle.exchange}:${tf}`;
    const bucket = Math.floor(candle.ts / tfMs) * tfMs;

    let state = this.states.get(key);
    if (!state || state.ts !== bucket) {
      state = {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        ts: bucket,
      };
      this.states.set(key, state);
    } else {
      state.high = Math.max(state.high, candle.high);
      state.low = Math.min(state.low, candle.low);
      state.close = candle.close;
      state.volume += candle.volume;
    }

    return {
      ...candle,
      open: state.open,
      high: state.high,
      low: state.low,
      close: state.close,
      volume: state.volume,
      ts: bucket,
    };
  }
}
