import winston from 'winston';
import path from 'node:path';

const LOG_DIR = process.env.LOG_DIR || path.join(process.env.APPDATA || process.env.HOME || '.', 'Kyamtale', 'logs');

function createLogger(): winston.Logger {
  const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'warn';

  const formats = [
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ];

  return winston.createLogger({
    level: logLevel,
    format: winston.format.combine(...formats),
    defaultMeta: { service: 'kyamtale-launcher' },
    transports: [
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'combined.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5
      })
    ]
  });
}

const logger = createLogger();

export default logger;
