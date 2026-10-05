import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const enumerateErrorFormat = format((info) => {
  if (info instanceof Error) {
    return { ...info, message: info.stack || info.message };
  }
  if (info.error && info.error instanceof Error) {
    return { ...info, message: info.message, error: info.error.stack };
  }
  return info;
});

const consoleTransport = new transports.Console({
  format: format.combine(
    format.colorize(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const extra = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}]: ${message}${extra}`;
    }),
  ),
  level: 'http',
});

const fileTransport = new transports.DailyRotateFile({
  dirname: logDir,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  maxSize: '20m',
  level: 'info',
  format: format.combine(
    enumerateErrorFormat(),
    format.timestamp(),
    format.json(),
  ),
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(enumerateErrorFormat(), format.timestamp()),
  transports: [fileTransport],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(consoleTransport);
} else {
  logger.add(consoleTransport);
}

export default logger;