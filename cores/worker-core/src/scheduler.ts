// cores/worker-core/src/scheduler.ts
export interface Job {
  name:       string
  intervalMs: number
  run:        () => Promise<void>
}

export class Scheduler {
  private timers: ReturnType<typeof setInterval>[] = []
  private running = false

  register(job: Job): void {
    const t = setInterval(async () => {
      try { await job.run() }
      catch (e) { console.error(`[scheduler][${job.name}]`, e) }
    }, job.intervalMs)
    this.timers.push(t)
    console.log(`[scheduler] registered ${job.name} every ${job.intervalMs}ms`)
  }

  destroy(): void {
    this.timers.forEach(clearInterval)
    this.timers = []
  }
}
