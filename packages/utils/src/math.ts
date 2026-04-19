// packages/utils/src/math.ts
export const clamp = (v:number,lo:number,hi:number):number => Math.min(Math.max(v,lo),hi)
export const round = (v:number,d=2):number => Math.round(v*10**d)/10**d

export function sma(v:number[], p:number):number|null {
  if(v.length<p) return null
  return v.slice(-p).reduce((a,b)=>a+b,0)/p
}
export function ema(v:number[], p:number):number|null {
  if(v.length<p) return null
  const k=2/(p+1)
  let val=v.slice(0,p).reduce((a,b)=>a+b,0)/p
  for(let i=p;i<v.length;i++) val=v[i]!*k+val*(1-k)
  return val
}
export function stddev(v:number[]):number|null {
  if(v.length<2) return null
  const mean=v.reduce((a,b)=>a+b,0)/v.length
  return Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/(v.length-1))
}
export function atr(highs:number[],lows:number[],closes:number[],p=14):number|null {
  if(highs.length<p+1) return null
  const trs=highs.map((_,i)=>i===0?0:Math.max(
    highs[i]!-lows[i]!,
    Math.abs(highs[i]!-closes[i-1]!),
    Math.abs(lows[i]!-closes[i-1]!)
  )).slice(1)
  let val=trs.slice(0,p).reduce((a,b)=>a+b,0)/p
  for(let i=p;i<trs.length;i++) val=(val*(p-1)+trs[i]!)/p
  return val
}
export const sleep = (ms:number):Promise<void> => new Promise(r=>setTimeout(r,ms))
