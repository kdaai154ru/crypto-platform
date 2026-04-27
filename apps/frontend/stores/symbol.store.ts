// apps/frontend/stores/symbol.store.ts
// Global symbol — единый выбор для всех виджетов
import { defineStore } from 'pinia'
import { ref } from 'vue'

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

export const useSymbolStore = defineStore('symbol', () => {
  const activeSymbol = ref('BTC/USDT')
  const activeTf     = ref('1h')

  function setSymbol(s: string) { activeSymbol.value = s }
  function setTf(t: string)     { activeTf.value = t }

  return { activeSymbol, activeTf, setSymbol, setTf }
})
