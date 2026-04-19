// packages/utils/src/retry.ts
import { sleep } from './math.js'
export async function withRetry<T>(
  fn:()=>Promise<T>,
  { maxAttempts=5, baseDelay=1000, maxDelay=30_000 }:{maxAttempts?:number;baseDelay?:number;maxDelay?:number}={}
):Promise<T> {
  let lastErr:unknown
  for(let i=0;i<maxAttempts;i++){
    try { return await fn() }
    catch(e){ lastErr=e; if(i<maxAttempts-1) await sleep(Math.min(baseDelay*2**i,maxDelay)) }
  }
  throw lastErr
}
