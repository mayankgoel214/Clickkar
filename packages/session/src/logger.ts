/**
 * Minimal structured logger writing JSON to stderr.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (level === 'debug' && process.env.NODE_ENV === 'production') return;
  process.stderr.write(
    JSON.stringify({
      level,
      message,
      ...data,
      ts: new Date().toISOString(),
    }) + '\n',
  );
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => write('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => write('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => write('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => write('error', message, data),
};
