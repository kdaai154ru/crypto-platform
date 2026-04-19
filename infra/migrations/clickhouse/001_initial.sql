-- infra/migrations/clickhouse/001_initial.sql
CREATE DATABASE IF NOT EXISTS crypto;

CREATE TABLE IF NOT EXISTS crypto.trades (
  symbol     LowCardinality(String),
  exchange   LowCardinality(String),
  ts         DateTime64(3, 'UTC'),
  side       Enum8('buy'=1, 'sell'=2),
  price      Float64,
  qty        Float64,
  usd_value  Float64,
  is_large   Bool
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(ts)
ORDER BY (symbol, exchange, ts)
TTL ts + INTERVAL 7 DAY;

CREATE TABLE IF NOT EXISTS crypto.candles_1m (
  symbol      LowCardinality(String),
  exchange    LowCardinality(String),
  ts          DateTime64(3, 'UTC'),
  open        Float64,
  high        Float64,
  low         Float64,
  close       Float64,
  volume      Float64,
  buy_volume  Float64,
  sell_volume Float64
) ENGINE = MergeTree()
ORDER BY (symbol, exchange, ts)
TTL ts + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS crypto.liquidations (
  symbol    LowCardinality(String),
  exchange  LowCardinality(String),
  ts        DateTime64(3, 'UTC'),
  side      Enum8('long'=1, 'short'=2),
  price     Float64,
  qty       Float64,
  usd_value Float64
) ENGINE = MergeTree()
ORDER BY (symbol, exchange, ts)
TTL ts + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS crypto.oi_history (
  symbol   LowCardinality(String),
  exchange LowCardinality(String),
  ts       DateTime64(3, 'UTC'),
  oi_usd   Float64,
  oi_coin  Float64
) ENGINE = MergeTree()
ORDER BY (symbol, exchange, ts);

CREATE TABLE IF NOT EXISTS crypto.funding_history (
  symbol   LowCardinality(String),
  exchange LowCardinality(String),
  ts       DateTime64(3, 'UTC'),
  rate     Float64,
  next_ts  DateTime64(3, 'UTC')
) ENGINE = MergeTree()
ORDER BY (symbol, exchange, ts);

CREATE TABLE IF NOT EXISTS crypto.etf_flows (
  date          Date,
  etf_name      LowCardinality(String),
  asset         LowCardinality(String),
  flow_usd      Float64,
  aum_usd       Float64,
  holdings_coin Float64
) ENGINE = MergeTree()
ORDER BY (date, etf_name);

-- Materialized view: 5m candles from 1m
CREATE MATERIALIZED VIEW IF NOT EXISTS crypto.candles_5m
ENGINE = MergeTree() ORDER BY (symbol, exchange, ts)
POPULATE AS
SELECT
  symbol, exchange,
  toStartOfFiveMinutes(ts) AS ts,
  argMin(open, ts)   AS open,
  max(high)          AS high,
  min(low)           AS low,
  argMax(close, ts)  AS close,
  sum(volume)        AS volume,
  sum(buy_volume)    AS buy_volume,
  sum(sell_volume)   AS sell_volume
FROM crypto.candles_1m
GROUP BY symbol, exchange, toStartOfFiveMinutes(ts);

-- Materialized view: 1h candles
CREATE MATERIALIZED VIEW IF NOT EXISTS crypto.candles_1h
ENGINE = MergeTree() ORDER BY (symbol, exchange, ts)
POPULATE AS
SELECT
  symbol, exchange,
  toStartOfHour(ts) AS ts,
  argMin(open, ts) AS open, max(high) AS high, min(low) AS low,
  argMax(close, ts) AS close, sum(volume) AS volume,
  sum(buy_volume) AS buy_volume, sum(sell_volume) AS sell_volume
FROM crypto.candles_1m
GROUP BY symbol, exchange, toStartOfHour(ts);
