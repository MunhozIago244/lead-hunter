import pino from 'pino'

const globalForLogger = globalThis as typeof globalThis & {
  __leadHunterLogger?: pino.Logger
}

// pino-pretty uses worker_threads which Turbopack cannot resolve at build time.
// Use plain JSON logging in all environments; pipe through `pino-pretty` CLI if desired.
export const logger =
  globalForLogger.__leadHunterLogger ??
  pino({ level: process.env.LOG_LEVEL ?? 'info' })

if (!globalForLogger.__leadHunterLogger) {
  globalForLogger.__leadHunterLogger = logger
}
