// packages/utils/src/symbol.ts
/** Normalizes exchange-specific symbol format to "XXX/USDT" */
export function normalizeSymbol(raw:string):string|null {
  const s=raw.toUpperCase().replace('-','/')
  if(s.includes('/')) {
    const [base,quote]=s.split('/')
    if(quote==='USDT' && base && base.length>=2) return `${base}/USDT`
    return null
  }
  if(s.endsWith('USDT') && s.length>4) return `${s.slice(0,-4)}/USDT`
  return null
}
export const isUSDTPair=(symbol:string):boolean=>symbol.endsWith('/USDT')
