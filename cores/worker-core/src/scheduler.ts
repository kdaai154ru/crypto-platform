// cores/worker-core/src/scheduler.ts
import type { Logger } from '@crypto-platform/logger';

export interface Job {
  name:       string
  intervalMs: number
  run:        () => Promise<void>
}

export class Scheduler {
  private timers: ReturnType<typeof setInterval>[] = []

  constructor(private readonly log: Logger) {}

  register(job: Job): void {
    const t = setInterval(async () => {
      try { await job.run() }
      catch (e) { this.log.error({ err: e, job: job.name }, 'scheduler job failed') }
    }, job.intervalMs)
    this.timers.push(t)
    this.log.info({ job: job.name, intervalMs: job.intervalMs }, 'scheduler job registered')
  }

  destroy(): void {
    this.timers.forEach(clearInterval)
    this.timers = []
    this.log.info('scheduler destroyed, all timers cleared')
  }
}
