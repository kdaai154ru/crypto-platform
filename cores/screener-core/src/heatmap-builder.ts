// cores/screener-core/src/heatmap-builder.ts
import type { HeatmapCell } from '@crypto-platform/types'

function rsiColor(val: number): string {
  if (val >= 80) return '#ef4444'
  if (val >= 70) return '#f97316'
  if (val >= 60) return '#fbbf24'
  if (val <= 20) return '#22c55e'
  if (val <= 30) return '#4ade80'
  if (val <= 40) return '#86efac'
  return '#6b7280'
}

export function buildRSIHeatmap(rsiMap: Map<string, number>, timeframe: string): HeatmapCell[] {
  return [...rsiMap.entries()].map(([symbol, value]) => ({
    symbol, tf: timeframe as any, value,
    color: rsiColor(value),
    label: value.toFixed(1)
  }))
}
