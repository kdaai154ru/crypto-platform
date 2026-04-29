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

const allSymbols = ref<string[]>([])
const favorites  = ref<string[]>(
  JSON.parse(typeof localStorage !== 'undefined' ? localStorage.getItem('sym:favorites') ?? '[]' : '[]')
)
const searchQuery    = ref('')
const activeCategory = ref<Category>('All')
let loaded = false

export async function loadSymbols(): Promise<void> {
  if (loaded && allSymbols.value.length > 0) return
  try {
    // Try backend Valkey cache first via ws-gateway /api/symbols
    const res = await fetch('/api/symbols/usdt').catch(() => null)
    if (res?.ok) {
      const data: string[] = await res.json()
      allSymbols.value = data
    } else {
      // Fallback: Binance public REST (CORS OK, no auth needed)
      const r = await fetch('https://api.binance.com/api/v3/exchangeInfo')
      const d: { symbols: { symbol: string; status: string; quoteAsset: string }[] } = await r.json()
      allSymbols.value = d.symbols
        .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map(s => s.symbol)
    }
    loaded = true
  } catch (e) {
    console.warn('[useSymbolSearch] failed to load symbols', e)
  }
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
