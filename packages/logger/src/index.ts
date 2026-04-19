// packages/logger/src/index.ts
import pino from 'pino'
export type Logger = pino.Logger
export function createLogger(name:string, extra?:Record<string,unknown>):pino.Logger {
  return pino({ name, level:process.env['LOG_LEVEL']??'info', ...extra })
}
