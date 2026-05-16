import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(service: string): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service, env: process.env.NODE_ENV ?? 'development' },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
          },
  });

}
