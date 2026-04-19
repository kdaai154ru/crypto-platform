// cores/aggregator-core/src/throttle-manager.ts
export class ThrottleManager {
  private lastSent = new Map<string,number>()
  shouldSend(key:string, minIntervalMs:number): boolean {
    const now = Date.now(), last = this.lastSent.get(key) ?? 0
    if(now-last >= minIntervalMs){ this.lastSent.set(key,now); return true }
    return false
  }
}
