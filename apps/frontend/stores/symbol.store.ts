// apps/frontend/stores/symbol.store.ts
// Global symbol — единый выбор для всех виджетов
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  allSymbols as allSymbolsRaw,
  loadSymbols,
  useSymbolSearch,
  type Category,
} from '~/composables/useSymbolSearch'

export type MarketType = 'spot' | 'perp'

// Legacy static list (fallback, используется если динамика не загружена)
export const SYMBOL_LIST: Record<string, string[]> = {
  All: [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
    'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'DOT/USDT',
    'MATIC/USDT', 'UNI/USDT', 'LTC/USDT', 'ATOM/USDT', 'NEAR/USDT',
    'FIL/USDT', 'APT/USDT', 'OP/USDT', 'ARB/USDT', 'SUI/USDT',
  ],
  Majors:  ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT'],
  DeFi:    ['UNI/USDT', 'LINK/USDT', 'AAVE/USDT', 'CRV/USDT', 'MKR/USDT'],
  L2:      ['MATIC/USDT', 'OP/USDT', 'ARB/USDT', 'IMX/USDT', 'MANTA/USDT'],
  Memes:   ['DOGE/USDT', 'SHIB/USDT', 'PEPE/USDT', 'WIF/USDT', 'BONK/USDT'],
}

// Spot символы: из Binance (без суффикса, нормализованы как BTCUSDT)
export const spotSymbols  = ref<string[]>([])
// Perp символы: из Bybit linear (BTCUSDT)
export const perpSymbols  = ref<string[]>([])

let spotLoaded = false
let perpLoaded = false

export async function loadSpotSymbols(): Promise<void> {
  if (spotLoaded && spotSymbols.value.length > 0) return
  try {
    const r = await fetch('https://api.binance.com/api/v3/exchangeInfo')
    const d = await r.json() as { symbols: { symbol: string; status: string; quoteAsset: string }[] }
    spotSymbols.value = d.symbols
      .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map(s => s.symbol)
      .sort()
    spotLoaded = true
  } catch { /* ignore, will use allSymbols fallback */ }
}

export async function loadPerpSymbols(): Promise<void> {
  if (perpLoaded && perpSymbols.value.length > 0) return
  try {
    const pages: string[] = []
    // Bybit requires pagination for full list
    let cursor = ''
    for (let i = 0; i < 5; i++) {
      const url = `https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000${cursor ? '&cursor=' + cursor : ''}`
      const r = await fetch(url)
      const d = await r.json() as {
        result?: {
          list?: { symbol: string; quoteCoin: string; status: string }[]
          nextPageCursor?: string
        }
      }
      const list = d.result?.list ?? []
      list.filter(s => s.quoteCoin === 'USDT' && s.status === 'Trading')
          .forEach(s => pages.push(s.symbol))
      cursor = d.result?.nextPageCursor ?? ''
      if (!cursor) break
    }
    perpSymbols.value = [...new Set(pages)].sort()
    perpLoaded = true
  } catch { /* ignore */ }
}

export const useSymbolStore = defineStore('symbol', () => {
  const activeSymbol = ref('BTC/USDT')
  const activeTf     = ref('1h')
  const marketType   = ref<MarketType>('spot')

  // Favorites stored in memory + synced to localStorage key
  const _favsKey = 'sym:store:favorites'
  const _raw = typeof localStorage !== 'undefined' ? localStorage.getItem(_favsKey) : null
  const favorites = ref<string[]>(_raw ? JSON.parse(_raw) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])

  function setSymbol(s: string) { activeSymbol.value = s }
  function setTf(t: string)     { activeTf.value = t }
  function setMarketType(m: MarketType) { marketType.value = m }

  function toggleFavorite(sym: string) {
    const idx = favorites.value.indexOf(sym)
    if (idx >= 0) favorites.value.splice(idx, 1)
    else favorites.value.unshift(sym)
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(_favsKey, JSON.stringify(favorites.value))
  }

  function isFavorite(sym: string) {
    return favorites.value.includes(sym)
  }

  return {
    activeSymbol, activeTf, marketType,
    favorites,
    setSymbol, setTf, setMarketType,
    toggleFavorite, isFavorite,
  }
})
