import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';

export interface SystemError {
  id: string;
  timestamp: Date;
  level: 'error' | 'warning' | 'critical';
  component: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface ErrorStats {
  totalErrors: number;
  criticalErrors: number;
  warnings: number;
  errorsByComponent: Record<string, number>;
  recentErrors: SystemError[];
  errorRate: number; // errors per hour
}

export class ErrorCollector extends EventEmitter {
  private errors: Map<string, SystemError> = new Map();
  private logger: Logger;
  private maxErrors: number = 1000; // Maximum number of errors to keep in memory
  private errorRateWindow: number = 60 * 60 * 1000; // 1 hour in milliseconds
  private errorCounts: number[] = []; // For calculating error rate

  constructor() {
    super();
    this.logger = new Logger('ErrorCollector');
    
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
    
    // Clean up old errors periodically
    setInterval(() => this.cleanupOldErrors(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Collect a new error
   */
  public collectError(
    level: 'error' | 'warning' | 'critical',
    component: string,
    message: string,
    stack?: string,
    context?: Record<string, any>
  ): SystemError {
    const error: SystemError = {
      id: this.generateErrorId(),
      timestamp: new Date(),
      level,
      component,
      message,
      stack,
      context,
      resolved: false
    };

    // Store the error
    this.errors.set(error.id, error);

    // Update error rate tracking
    this.updateErrorRate();

    // Log the error
    this.logError(error);

    // Emit event for real-time monitoring
    this.emit('errorCollected', error);

    // Clean up if we have too many errors
    if (this.errors.size > this.maxErrors) {
      this.cleanupOldErrors();
    }

    return error;
  }

  /**
   * Mark an error as resolved
   */
  public resolveError(errorId: string): boolean {
    const error = this.errors.get(errorId);
    if (!error) {
      return false;
    }

    error.resolved = true;
    error.resolvedAt = new Date();

    this.logger.info(`Error resolved: ${errorId} in component ${error.component}`);
    this.emit('errorResolved', error);

    return true;
  }

  /**
   * Get all errors
   */
  public getAllErrors(): SystemError[] {
    return Array.from(this.errors.values()).sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Get errors by component
   */
  public getErrorsByComponent(component: string): SystemError[] {
    return this.getAllErrors().filter(error => error.component === component);
  }

  /**
   * Get unresolved errors
   */
  public getUnresolvedErrors(): SystemError[] {
    return this.getAllErrors().filter(error => !error.resolved);
  }

  /**
   * Get recent errors (last 24 hours)
   */
  public getRecentErrors(hours: number = 24): SystemError[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.getAllErrors().filter(error => error.timestamp > cutoffTime);
  }

  /**
   * Get error statistics
   */
  public getErrorStats(): ErrorStats {
    const allErrors = this.getAllErrors();
    const recentErrors = this.getRecentErrors(24);
    
    const errorsByComponent: Record<string, number> = {};
    let criticalErrors = 0;
    let warnings = 0;

    allErrors.forEach(error => {
      // Count by component
      errorsByComponent[error.component] = (errorsByComponent[error.component] || 0) + 1;
      
      // Count by level
      if (error.level === 'critical') {
        criticalErrors++;
      } else if (error.level === 'warning') {
        warnings++;
      }
    });

    // Calculate error rate (errors per hour)
    const errorRate = this.calculateErrorRate();

    return {
      totalErrors: allErrors.length,
      criticalErrors,
      warnings,
      errorsByComponent,
      recentErrors: recentErrors.slice(0, 10), // Last 10 recent errors
      errorRate
    };
  }

  /**
   * Clear all errors
   */
  public clearAllErrors(): void {
    this.errors.clear();
    this.errorCounts = [];
    this.logger.info('All errors cleared');
    this.emit('errorsCleared');
  }

  /**
   * Clear resolved errors
   */
  public clearResolvedErrors(): void {
    const resolvedErrors = this.getUnresolvedErrors();
    this.errors.clear();
    
    resolvedErrors.forEach(error => {
      this.errors.set(error.id, error);
    });

    this.logger.info(`Cleared ${this.errors.size - resolvedErrors.length} resolved errors`);
    this.emit('resolvedErrorsCleared');
  }

  /**
   * Get system health based on errors
   */
  public getSystemHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    score: number; // 0-100
    issues: string[];
  } {
    const stats = this.getErrorStats();
    const recentErrors = this.getRecentErrors(1); // Last hour
    const criticalErrors = recentErrors.filter(e => e.level === 'critical');
    const unresolvedCritical = this.getUnresolvedErrors().filter(e => e.level === 'critical');

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    let score = 100;
    const issues: string[] = [];

    // Check for critical errors
    if (unresolvedCritical.length > 0) {
      status = 'critical';
      score -= 50;
      issues.push(`${unresolvedCritical.length} unresolved critical errors`);
    }

    // Check error rate
    if (stats.errorRate > 10) {
      status = status === 'critical' ? 'critical' : 'warning';
      score -= 20;
      issues.push(`High error rate: ${stats.errorRate.toFixed(2)} errors/hour`);
    }

    // Check for recent critical errors
    if (criticalErrors.length > 0) {
      status = status === 'critical' ? 'critical' : 'warning';
      score -= 30;
      issues.push(`${criticalErrors.length} critical errors in the last hour`);
    }

    // Check for too many warnings
    if (stats.warnings > 50) {
      status = status === 'critical' ? 'critical' : 'warning';
      score -= 10;
      issues.push(`${stats.warnings} warnings in system`);
    }

    return {
      status,
      score: Math.max(0, score),
      issues
    };
  }

  /**
   * Set up global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.collectError('critical', 'process', 'Uncaught Exception', error.stack, {
        name: error.name,
        message: error.message
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.collectError('critical', 'process', 'Unhandled Promise Rejection', undefined, {
        reason: reason?.toString(),
        promise: promise?.toString()
      });
    });

    // Handle warnings
    process.on('warning', (warning) => {
      this.collectError('warning', 'process', 'Process Warning', warning.stack, {
        name: warning.name,
        message: warning.message
      });
    });
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log error to console
   */
  private logError(error: SystemError): void {
    const logMessage = `[${error.component}] ${error.message}`;
    
    switch (error.level) {
      case 'critical':
        this.logger.error(logMessage, error.stack, error.context);
        break;
      case 'warning':
        this.logger.warn(logMessage, error.context);
        break;
      default:
        this.logger.error(logMessage, error.stack, error.context);
    }
  }

  /**
   * Update error rate tracking
   */
  private updateErrorRate(): void {
    const now = Date.now();
    this.errorCounts.push(now);
    
    // Remove counts older than the window
    this.errorCounts = this.errorCounts.filter(time => 
      now - time < this.errorRateWindow
    );
  }

  /**
   * Calculate current error rate
   */
  private calculateErrorRate(): number {
    const now = Date.now();
    const recentCounts = this.errorCounts.filter(time => 
      now - time < this.errorRateWindow
    );
    
    return recentCounts.length; // errors per hour
  }

  /**
   * Clean up old errors
   */
  private cleanupOldErrors(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const errorsToDelete: string[] = [];

    this.errors.forEach((error, id) => {
      if (error.timestamp < cutoffTime && error.resolved) {
        errorsToDelete.push(id);
      }
    });

    errorsToDelete.forEach(id => {
      this.errors.delete(id);
    });

    if (errorsToDelete.length > 0) {
      this.logger.info(`Cleaned up ${errorsToDelete.length} old errors`);
    }
  }
}
