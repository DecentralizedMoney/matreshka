import pino from 'pino';
import { resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';

export interface LoggerOptions {
  level?: string;
  context?: string;
  pretty?: boolean;
  enableFileLogging?: boolean;
}

export class Logger {
  private logger: pino.Logger;
  private context: string;

  constructor(context: string = 'Default', options: LoggerOptions = {}) {
    this.context = context;
    
    // Ensure logs directory exists
    const logsDir = resolve(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    const level = options.level || process.env['LOG_LEVEL'] || 'info';
    const isDevelopment = process.env['NODE_ENV'] !== 'production';
    const enablePretty = options.pretty ?? isDevelopment;

    // Base logger configuration
    const loggerConfig: pino.LoggerOptions = {
      level,
      base: {
        context: this.context,
        pid: process.pid,
        hostname: require('os').hostname(),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          pid: bindings['pid'],
          hostname: bindings['hostname'],
        }),
      },
    };

    // Configure transport for pretty printing in development
    if (enablePretty) {
      loggerConfig.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '[{context}] {msg}',
          singleLine: false,
        },
      };
    }

    // Create multi-stream logger for production
    if (!enablePretty && (options.enableFileLogging ?? true)) {
      const streams: pino.StreamEntry[] = [
        {
          level: 'info',
          stream: process.stdout,
        },
        {
          level: 'error',
          stream: pino.destination({
            dest: resolve(logsDir, 'error.log'),
            sync: false,
            mkdir: true,
          }),
        },
        {
          level: 'info',
          stream: pino.destination({
            dest: resolve(logsDir, 'combined.log'),
            sync: false,
            mkdir: true,
          }),
        },
      ];

      this.logger = pino(loggerConfig, pino.multistream(streams));
    } else {
      this.logger = pino(loggerConfig);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(meta, message);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorInfo = error instanceof Error 
      ? { 
          error: error.message, 
          stack: error.stack,
          name: error.name,
        }
      : { error };
    
    this.logger.error({ ...errorInfo, ...meta }, message);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(meta, message);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(meta, message);
  }

  verbose(message: string, meta?: Record<string, unknown>): void {
    this.logger.trace(meta, message);
  }

  trace(message: string, meta?: Record<string, unknown>): void {
    this.logger.trace(meta, message);
  }

  fatal(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorInfo = error instanceof Error 
      ? { 
          error: error.message, 
          stack: error.stack,
          name: error.name,
        }
      : { error };
    
    this.logger.fatal({ ...errorInfo, ...meta }, message);
  }

  child(bindings: Record<string, unknown>): Logger {
    const childLogger = new Logger(this.context);
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }

  // Performance optimized logging methods
  time(label: string): void {
    this.logger.info(`⏱️ Timer started: ${label}`);
  }

  timeEnd(label: string, meta?: Record<string, unknown>): void {
    this.logger.info(meta, `⏱️ Timer ended: ${label}`);
  }

  // Structured logging for trading events
  logTrade(action: string, data: Record<string, unknown>): void {
    this.logger.info({ 
      type: 'trade',
      action,
      ...data 
    }, `📈 Trade ${action}`);
  }

  logOpportunity(data: Record<string, unknown>): void {
    this.logger.info({ 
      type: 'opportunity',
      ...data 
    }, '🎯 Arbitrage opportunity detected');
  }

  logSystemEvent(event: string, data?: Record<string, unknown>): void {
    this.logger.info({ 
      type: 'system',
      event,
      ...data 
    }, `🔧 System event: ${event}`);
  }

  logPerformance(metrics: Record<string, unknown>): void {
    this.logger.info({ 
      type: 'performance',
      ...metrics 
    }, '📊 Performance metrics');
  }

  // Health check logging
  logHealth(status: 'healthy' | 'unhealthy', details?: Record<string, unknown>): void {
    const level = status === 'healthy' ? 'info' : 'warn';
    this.logger[level]({ 
      type: 'health',
      status,
      ...details 
    }, `💓 Health check: ${status}`);
  }
}

// Global logger instance
export const globalLogger = new Logger('Global', {
  enableFileLogging: true,
});

// Singleton pattern for logger factory
class LoggerFactory {
  private loggers = new Map<string, Logger>();

  getLogger(context: string, options?: LoggerOptions): Logger {
    if (!this.loggers.has(context)) {
      this.loggers.set(context, new Logger(context, options));
    }
    return this.loggers.get(context)!;
  }

  clearCache(): void {
    this.loggers.clear();
  }
}

export const loggerFactory = new LoggerFactory();