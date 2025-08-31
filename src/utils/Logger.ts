import winston from 'winston';
import path from 'path';

export class Logger {
  private logger: winston.Logger;
  private component: string;

  constructor(component: string) {
    this.component = component;
    this.logger = this.createLogger();
  }

  private createLogger(): winston.Logger {
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${this.component}] ${level.toUpperCase()}: ${message}`;
        
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        
        if (stack) {
          log += `\n${stack}`;
        }
        
        return log;
      })
    );

    const transports: winston.transport[] = [
      // Console transport
      new winston.transports.Console({
        level: process.env['LOG_LEVEL'] || 'info',
        format: winston.format.combine(
          winston.format.colorize(),
          logFormat
        )
      })
    ];

    // File transports
    if (process.env['NODE_ENV'] === 'production') {
      transports.push(
        new winston.transports.File({
          filename: path.join('logs', 'error.log'),
          level: 'error',
          format: logFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: path.join('logs', 'combined.log'),
          format: logFormat,
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10
        })
      );
    }

    return winston.createLogger({
      level: process.env['LOG_LEVEL'] || 'info',
      format: logFormat,
      transports,
      exitOnError: false
    });
  }

  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  public error(message: string, error?: Error | any): void {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack });
    } else {
      this.logger.error(message, error);
    }
  }

  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  public verbose(message: string, meta?: any): void {
    this.logger.verbose(message, meta);
  }
}
