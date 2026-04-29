// apps/frontend/composables/useSymbolSearch.ts
import { ref, computed } from 'vue'

export const CATEGORIES: Record<string, string[]> = {
  Memes:  ['DOGE','SHIB','PEPE','FLOKI','BONK','WIF','MEME','TURBO','NEIRO','BRETT','MOG','POPCAT','BOME','DOGS'],
  DeFi:   ['UNI','AAVE','COMP','CRV','SNX','1INCH','SUSHI','CAKE','BAL','YFI','CVX','FXS','LDO','RPL','PENDLE'],
  L1:     ['BTC','ETH','SOL','AVAX','ADA','DOT','ATOM','NEAR','APT','SUI','SEI','INJ','TIA','ALGO','FIL','ICP'],
  L2:     ['MATIC','ARB','OP','STRK','MANTA','SCROLL','BLAST','ZK','METIS','IMX','LOOPRING'],
  L3:     ['XAI','RARI','DEGEN','HOOK'],
  RWA:    ['ONDO','POLYX','CFG','RIO','PRCL','TOKEN','MPL','TRU'],
  AI:     ['FET','AGIX','OCEAN','NMR','RENDER','WLD','TAO','ARKM','GRT','ORAI'],
  Gaming: ['AXS','SAND','MANA','ENJ','GALA','IMX','BEAM','MAGIC','YGG','PYR'],
  BTC_Fi: ['WBTC','CORE','ORDI','SATS','RATS','1000SATS'],
}

export type Category = keyof typeof CATEGORIES | 'All' | 'Favorites'

// Multi-exchange USDT symbol sources
const EXCHANGE_SOURCES: { id: string; url: string; parser: (d: unknown) => string[] }[] = [
  {
    id: 'binance',
    url: 'https://api.binance.com/api/v3/exchangeInfo',
    parser: (d: unknown) => {
      const data = d as { symbols: { symbol: string; status: string; quoteAsset: string }[] }
      return data.symbols
        .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map(s => s.symbol)
    },
  },
  {
    id: 'bybit',
    url: 'https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000',
    parser: (d: unknown) => {
      const data = d as { result?: { list?: { symbol: string; quoteCoin: string; status: string }[] } }
      return (data.result?.list ?? [])
        .filter(s => s.quoteCoin === 'USDT' && s.status === 'Trading')
        .map(s => s.symbol)
    },
  },
  {
    id: 'okx',
    url: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    parser: (d: unknown) => {
      const data = d as { data?: { instId: string }[] }
      return (data.data ?? [])
        .filter(s => s.instId.endsWith('-USDT'))
        .map(s => s.instId.replace('-USDT', 'USDT'))
    },
  },
  {
    id: 'kucoin',
    url: 'https://api.kucoin.com/api/v1/symbols',
    parser: (d: unknown) => {
      const data = d as { data?: { symbol: string; quoteCurrency: string; enableTrading: boolean }[] }
      return (data.data ?? [])
        .filter(s => s.quoteCurrency === 'USDT' && s.enableTrading)
        .map(s => s.symbol.replace('-USDT', 'USDT'))
    },
  },
  {
    id: 'gate',
    url: 'https://api.gateio.ws/api/v4/spot/currency_pairs',
    parser: (d: unknown) => {
      const data = d as { quote?: string; id?: string; trade_status?: string }[]
      return data
        .filter(s => s.quote === 'USDT' && s.trade_status === 'tradable')
        .map(s => s.id!.replace('_USDT', 'USDT'))
    },
  },
  {
    id: 'mexc',
    url: 'https://api.mexc.com/api/v3/exchangeInfo',
    parser: (d: unknown) => {
      const data = d as { symbols?: { symbol: string; quoteAsset: string; status: string }[] }
      return (data.symbols ?? [])
        .filter(s => s.quoteAsset === 'USDT' && s.status === 'ENABLED')
        .map(s => s.symbol)
    },
  },
  {
    id: 'bitget',
    url: 'https://api.bitget.com/api/spot/v1/public/products',
    parser: (d: unknown) => {
      const data = d as { data?: { symbolName: string; quoteCoin: string; status: string }[] }
      return (data.data ?? [])
        .filter(s => s.quoteCoin === 'USDT' && s.status === 'online')
        .map(s => s.symbolName.replace('_USDT', 'USDT'))
    },
  },
]

export const allSymbols = ref<string[]>([])
const favorites  = ref<string[]>(
  JSON.parse(typeof localStorage !== 'undefined' ? localStorage.getItem('sym:favorites') ?? '[]' : '[]')
)
const searchQuery    = ref('')
const activeCategory = ref<Category>('All')
let loaded = false

/** Дедупликация + сортировка */
function mergeUnique(lists: string[][]): string[] {
  const set = new Set<string>()
  for (const list of lists) for (const s of list) set.add(s)
  return [...set].sort()
}

export async function loadSymbols(): Promise<void> {
  if (loaded && allSymbols.value.length > 0) return
  try {
    // Try backend Valkey cache first
    const res = await fetch('/api/symbols/usdt').catch(() => null)
    if (res?.ok) {
      const data: string[] = await res.json()
      if (data.length > 0) {
        allSymbols.value = data
        loaded = true
        return
      }
    }
    // Fallback: fetch from all exchanges in parallel, merge+dedup
    const results = await Promise.allSettled(
      EXCHANGE_SOURCES.map(src =>
        fetch(src.url)
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
          .then(d => src.parser(d))
          .catch(() => [] as string[])
      )
    )
    const lists = results.map(r => r.status === 'fulfilled' ? r.value : [])
    const merged = mergeUnique(lists)
    if (merged.length > 0) allSymbols.value = merged
    loaded = true
  } catch (e) {
    console.warn('[useSymbolSearch] failed to load symbols', e)
  }
}

/** Топ-N по объёму из Binance (lazy, кешируется) */
const rankCache = ref<Map<string, number>>(new Map())
let rankLoaded = false

export async function loadBinanceRanks(): Promise<Map<string, number>> {
  if (rankLoaded) return rankCache.value
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr')
    const data: { symbol: string; quoteVolume: string }[] = await r.json()
    const sorted = data
      .filter(d => d.symbol.endsWith('USDT'))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    sorted.forEach((d, i) => rankCache.value.set(d.symbol, i + 1))
    rankLoaded = true
  } catch { /* ignore */ }
  return rankCache.value
}

/** Получить топ-N символов (по объёму Binance 24h) */
export async function getTopN(n: number): Promise<string[]> {
  const ranks = await loadBinanceRanks()
  return [...ranks.entries()]
    .filter(([, rank]) => rank <= n)
    .sort((a, b) => a[1] - b[1])
    .map(([sym]) => sym)
    .slice(0, n)
}

export function useSymbolSearch() {
  const filtered = computed(() => {
    let list = allSymbols.value

    if (activeCategory.value === 'Favorites') {
      list = favorites.value
    } else if (activeCategory.value !== 'All') {
      const tags = CATEGORIES[activeCategory.value] ?? []
      list = list.filter(s => tags.some(t => s.startsWith(t + 'USDT') || s === t + 'USDT'))
    }

    const q = searchQuery.value.trim().toUpperCase()
    if (q) list = list.filter(s => s.includes(q))

    return list
  })

  function toggleFavorite(sym: string) {
    const idx = favorites.value.indexOf(sym)
    if (idx >= 0) favorites.value.splice(idx, 1)
    else favorites.value.push(sym)
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('sym:favorites', JSON.stringify(favorites.value))
  }

  function isFavorite(sym: string) {
    return favorites.value.includes(sym)
  }

  return {
    allSymbols,
    filtered,
    searchQuery,
    activeCategory,
    favorites,
    toggleFavorite,
    isFavorite,
    loadSymbols,
    CATEGORIES,
    categories: ['All', 'Favorites', ...Object.keys(CATEGORIES)] as Category[],
  }
}
