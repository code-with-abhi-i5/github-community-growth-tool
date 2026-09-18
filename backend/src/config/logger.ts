import winston from 'winston';
import { config } from './index';

const logger = winston.createLogger({
  level: config.isDev ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.isDev
      ? winston.format.combine(winston.format.colorize(), winston.format.simple())
      : winston.format.json()
  ),
  defaultMeta: { service: 'gitflow-manager' },
  transports: [new winston.transports.Console()],
});

// Never log sensitive data
export function sanitizeLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ['accessToken', 'token', 'secret', 'password', 'authorization'];
  const sanitized = { ...obj };
  for (const key of Object.keys(sanitized)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

export default logger;
