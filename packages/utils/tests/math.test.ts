// packages/utils/tests/math.test.ts
import { describe, it, expect } from "vitest"
import { sma, ema, stddev, clamp, atr, normalizeSymbol, isUSDTPair } from "../src/index.js"

describe("sma", () => {
  it("returns null when insufficient data", () => expect(sma([1,2],5)).toBeNull())
  it("computes correctly", () => expect(sma([1,2,3,4,5],3)).toBeCloseTo(4))
})
describe("ema", () => {
  it("returns null when insufficient", () => expect(ema([1,2],5)).toBeNull())
  it("returns number", () => expect(typeof ema([1,2,3,4,5,6,7,8,9,10],3)).toBe("number"))
})
describe("stddev", () => {
  it("null for single", () => expect(stddev([1])).toBeNull())
  it("correct value", () => expect(stddev([2,4,4,4,5,5,7,9])).toBeCloseTo(2,0))
})
describe("clamp", () => {
  it("clamps high", () => expect(clamp(10,0,5)).toBe(5))
  it("clamps low",  () => expect(clamp(-1,0,5)).toBe(0))
})
describe("normalizeSymbol", () => {
  it("BTCUSDT", () => expect(normalizeSymbol("BTCUSDT")).toBe("BTC/USDT"))
  it("BTC-USDT", () => expect(normalizeSymbol("BTC-USDT")).toBe("BTC/USDT"))
  it("BTC/BNB null", () => expect(normalizeSymbol("BTC/BNB")).toBeNull())
  it("isUSDTPair", () => { expect(isUSDTPair("BTC/USDT")).toBe(true); expect(isUSDTPair("BTC/BNB")).toBe(false) })
})
