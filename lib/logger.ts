import pino from 'pino'

const globalForLogger = globalThis as typeof globalThis & {
  __leadHunterLogger?: pino.Logger
}

export const logger =
  globalForLogger.__leadHunterLogger ??
  pino({
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    }),
  })

if (!globalForLogger.__leadHunterLogger) {
  globalForLogger.__leadHunterLogger = logger
}
