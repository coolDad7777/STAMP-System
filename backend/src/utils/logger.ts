import winston from 'winston';

const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export const logger = {
  fatal: (msg: any) => winstonLogger.error(msg),
  error: (msg: any) => winstonLogger.error(msg),
  warn: (msg: any) => winstonLogger.warn(msg),
  info: (msg: any) => winstonLogger.info(msg),
  debug: (msg: any) => winstonLogger.debug(msg),
  trace: (msg: any) => winstonLogger.verbose(msg),
  child: (opts: any) => winstonLogger.child(opts),
  level: process.env.LOG_LEVEL || 'info'
};
