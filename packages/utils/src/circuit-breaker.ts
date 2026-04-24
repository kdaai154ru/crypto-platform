// packages/utils/src/circuit-breaker.ts
// FIX #32: added public open() method — called from connector.ts handleStreamError()
export type CBState = 'CLOSED'|'OPEN'|'HALF_OPEN'
export interface CBOptions { failureThreshold?:number; recoveryTimeout?:number; successThreshold?:number }

export class CircuitBreaker {
  private state:CBState='CLOSED'
  private failures=0; private successes=0; private openAt=0
  constructor(
    private readonly name:string,
    private readonly opts:Required<CBOptions> = {failureThreshold:5, recoveryTimeout:30_000, successThreshold:2}
  ){}

  async execute<T>(fn:()=>Promise<T>):Promise<T> {
    if(this.state==='OPEN') {
      if(Date.now()-this.openAt<this.opts.recoveryTimeout) throw new Error(`CircuitBreaker[${this.name}] OPEN`)
      // FIX: reset failures so that the first probe error in HALF_OPEN
      // does not immediately re-open the breaker.
      this.state='HALF_OPEN'; this.successes=0; this.failures=0
    }
    try {
      const result=await fn()
      this.onSuccess(); return result
    } catch(e) { this.onFailure(); throw e }
  }

  private onSuccess() {
    this.failures=0
    if(this.state==='HALF_OPEN') {
      this.successes++
      if(this.successes>=this.opts.successThreshold) this.state='CLOSED'
    }
  }

  private onFailure() {
    this.failures++
    if(this.failures>=this.opts.failureThreshold) {
      this.state='OPEN'
      this.openAt=Date.now()
    }
  }

  // FIX #32: public method — force-opens the breaker from external callers
  open(): void {
    this.state = 'OPEN'
    this.openAt = Date.now()
    this.failures = this.opts.failureThreshold
  }

  getState():CBState { return this.state }
  reset() { this.state='CLOSED'; this.failures=0; this.successes=0 }
}
