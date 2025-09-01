import { Logger } from './Logger';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  NETWORK = 'network',
  EXCHANGE_API = 'exchange_api',
  TRADING = 'trading',
  RISK_MANAGEMENT = 'risk_management',
  DATA_VALIDATION = 'data_validation',
  SYSTEM = 'system',
  CONFIGURATION = 'configuration',
  AUTHENTICATION = 'authentication',
}

export interface ErrorContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  exchange?: string;
  symbol?: string;
  operation?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export class MatreshkaError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly retryable: boolean;
  public readonly code?: string | undefined;

  constructor(
    message: string,
    context: ErrorContext,
    options: {
      cause?: Error;
      retryable?: boolean;
      code?: string;
    } = {}
  ) {
    super(message);
    
    this.name = 'MatreshkaError';
    this.category = context.category;
    this.severity = context.severity;
    this.context = context;
    this.timestamp = new Date();
    this.retryable = options.retryable ?? false;
    this.code = options.code ?? undefined;

    if (options.cause) {
      this.cause = options.cause;
      this.stack = this.stack + '\nCaused by: ' + options.cause.stack;
    }

    // Ensure the error's prototype is properly set
    Object.setPrototypeOf(this, MatreshkaError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      retryable: this.retryable,
      code: this.code,
      stack: this.stack,
    };
  }
}

export class NetworkError extends MatreshkaError {
  constructor(message: string, context: Omit<ErrorContext, 'category'>, options?: { cause?: Error; retryable?: boolean }) {
    super(message, { ...context, category: ErrorCategory.NETWORK }, {
      ...options,
      retryable: options?.retryable ?? true,
    });
    this.name = 'NetworkError';
  }
}

export class ExchangeAPIError extends MatreshkaError {
  public readonly exchangeErrorCode?: string | undefined;
  public readonly rateLimited: boolean;

  constructor(
    message: string, 
    context: Omit<ErrorContext, 'category'>, 
    options: { 
      cause?: Error; 
      retryable?: boolean; 
      exchangeErrorCode?: string;
      rateLimited?: boolean;
    } = {}
  ) {
    super(message, { ...context, category: ErrorCategory.EXCHANGE_API }, options);
    this.name = 'ExchangeAPIError';
    this.exchangeErrorCode = options.exchangeErrorCode ?? undefined;
    this.rateLimited = options.rateLimited ?? false;
  }
}

export class TradingError extends MatreshkaError {
  constructor(message: string, context: Omit<ErrorContext, 'category'>, options?: { cause?: Error; retryable?: boolean }) {
    super(message, { ...context, category: ErrorCategory.TRADING }, options);
    this.name = 'TradingError';
  }
}

export class RiskManagementError extends MatreshkaError {
  constructor(message: string, context: Omit<ErrorContext, 'category'>, options?: { cause?: Error }) {
    super(message, { ...context, category: ErrorCategory.RISK_MANAGEMENT }, {
      ...options,
      retryable: false, // Risk errors should not be retried automatically
    });
    this.name = 'RiskManagementError';
  }
}

export class ConfigurationError extends MatreshkaError {
  constructor(message: string, context: Omit<ErrorContext, 'category'>, options?: { cause?: Error }) {
    super(message, { ...context, category: ErrorCategory.CONFIGURATION }, {
      ...options,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

export class ErrorHandler {
  private logger: Logger;
  private errorCounts = new Map<string, number>();
  private lastErrorTime = new Map<string, number>();
  private circuitBreakers = new Map<string, { failures: number; lastFailure: number; state: 'closed' | 'open' | 'half-open' }>();

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('ErrorHandler');
  }

  handle(error: Error | MatreshkaError, context?: Partial<ErrorContext>): void {
    const matreshkaError = this.normalizeError(error, context);
    
    // Log the error
    this.logError(matreshkaError);
    
    // Update error statistics
    this.updateErrorStats(matreshkaError);
    
    // Handle circuit breaker logic
    this.updateCircuitBreaker(matreshkaError);
    
    // Emit error events if needed
    this.emitErrorEvent(matreshkaError);
    
    // Handle critical errors
    if (matreshkaError.severity === ErrorSeverity.CRITICAL) {
      this.handleCriticalError(matreshkaError);
    }
  }

  private normalizeError(error: Error | MatreshkaError, context?: Partial<ErrorContext>): MatreshkaError {
    if (error instanceof MatreshkaError) {
      return error;
    }

    // Detect error type and create appropriate MatreshkaError
    let category = ErrorCategory.SYSTEM;
    let severity = ErrorSeverity.MEDIUM;
    let retryable = false;

    // Network-related errors
    if (error.message.includes('ENOTFOUND') || 
        error.message.includes('ECONNREFUSED') || 
        error.message.includes('timeout')) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    }

    // Rate limiting
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      category = ErrorCategory.EXCHANGE_API;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    }

    // Authentication errors
    if (error.message.includes('unauthorized') || 
        error.message.includes('invalid signature') ||
        error.message.includes('api key')) {
      category = ErrorCategory.AUTHENTICATION;
      severity = ErrorSeverity.HIGH;
      retryable = false;
    }

    const defaultContext: ErrorContext = {
      category,
      severity,
      ...context,
    };

    return new MatreshkaError(error.message, defaultContext, { 
      cause: error,
      retryable,
    });
  }

  private logError(error: MatreshkaError): void {
    const logLevel = this.getLogLevel(error.severity);
    const logData = {
      errorId: this.generateErrorId(),
      category: error.category,
      severity: error.severity,
      retryable: error.retryable,
      context: error.context,
      timestamp: error.timestamp,
      code: error.code,
    };

    this.logger[logLevel](error.message, logData);

    // Log stack trace for high severity errors
    if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
      this.logger.error('Stack trace:', { stack: error.stack });
    }
  }

  private getLogLevel(severity: ErrorSeverity): 'debug' | 'info' | 'warn' | 'error' | 'fatal' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'debug';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.CRITICAL:
        return 'fatal';
      default:
        return 'error';
    }
  }

  private updateErrorStats(error: MatreshkaError): void {
    const key = `${error.category}:${error.context.exchange || 'global'}`;
    const currentCount = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, currentCount + 1);
    this.lastErrorTime.set(key, Date.now());
  }

  private updateCircuitBreaker(error: MatreshkaError): void {
    if (!error.context.exchange) return;

    const key = `${error.context.exchange}:${error.category}`;
    const breaker = this.circuitBreakers.get(key) || { 
      failures: 0, 
      lastFailure: 0, 
      state: 'closed' as const 
    };

    if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
      breaker.failures++;
      breaker.lastFailure = Date.now();

      // Open circuit breaker after 5 failures in 5 minutes
      if (breaker.failures >= 5 && Date.now() - breaker.lastFailure < 5 * 60 * 1000) {
        breaker.state = 'open';
        this.logger.warn(`Circuit breaker opened for ${key}`, { 
          failures: breaker.failures,
          category: error.category,
          exchange: error.context.exchange,
        });
      }
    } else if (breaker.state === 'open' && Date.now() - breaker.lastFailure > 10 * 60 * 1000) {
      // Try to recover after 10 minutes
      breaker.state = 'half-open';
      breaker.failures = Math.max(0, breaker.failures - 1);
    }

    this.circuitBreakers.set(key, breaker);
  }

  private emitErrorEvent(error: MatreshkaError): void {
    // Emit to event system if available
    process.nextTick(() => {
      process.emit('matreshka:error' as any, error);
    });
  }

  private handleCriticalError(error: MatreshkaError): void {
    this.logger.fatal('CRITICAL ERROR DETECTED - System may require immediate attention', {
      error: error.toJSON(),
    });

    // Implement emergency procedures
    if (error.category === ErrorCategory.RISK_MANAGEMENT) {
      process.nextTick(() => {
        process.emit('matreshka:emergency-stop' as any, error);
      });
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public query methods
  getErrorStats(): Record<string, { count: number; lastError: number }> {
    const stats: Record<string, { count: number; lastError: number }> = {};
    
    for (const [key, count] of this.errorCounts.entries()) {
      stats[key] = {
        count,
        lastError: this.lastErrorTime.get(key) || 0,
      };
    }
    
    return stats;
  }

  getCircuitBreakerStatus(): Record<string, { failures: number; state: string; lastFailure: number }> {
    const status: Record<string, { failures: number; state: string; lastFailure: number }> = {};
    
    for (const [key, breaker] of this.circuitBreakers.entries()) {
      status[key] = {
        failures: breaker.failures,
        state: breaker.state,
        lastFailure: breaker.lastFailure,
      };
    }
    
    return status;
  }

  isCircuitBreakerOpen(exchange: string, category: ErrorCategory): boolean {
    const key = `${exchange}:${category}`;
    const breaker = this.circuitBreakers.get(key);
    return breaker?.state === 'open';
  }

  resetErrorStats(): void {
    this.errorCounts.clear();
    this.lastErrorTime.clear();
  }

  resetCircuitBreakers(): void {
    this.circuitBreakers.clear();
  }
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler();
