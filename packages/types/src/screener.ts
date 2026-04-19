// packages/types/src/screener.ts

export interface ScreenerRow {
  symbol:  string;
  tf:      string;
  screener: string;
  value:   number;
  ts:      number;
}

export interface HeatmapCell {
  symbol: string;
  tf:     string;
  value:  number;
  color:  string;
  label:  string;
}