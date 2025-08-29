import { EventEmitter } from 'events';
import { ArbitrageExecution, PerformanceMetrics } from '../types';
import { Logger } from '../utils/Logger';

export class PerformanceTracker extends EventEmitter {
  private logger: Logger;
  private metrics: PerformanceMetrics;

  constructor() {
    super();
    this.logger = new Logger('PerformanceTracker');
    this.metrics = {
      totalTrades: 0,
      successfulTrades: 0,
      totalProfitUSD: 0,
      totalFeesUSD: 0,
      averageExecutionTime: 0,
      bestOpportunityProfit: 0,
      worstOpportunityProfit: 0,
      dailyPnL: [],
      sharpeRatio: 0,
      maxDrawdown: 0
    };
  }

  public recordExecutionStart(execution: ArbitrageExecution): void {
    this.logger.debug(`Recording execution start: ${execution.opportunityId}`);
  }

  public recordExecutionComplete(execution: ArbitrageExecution): void {
    this.metrics.totalTrades++;
    this.metrics.successfulTrades++;
    this.metrics.totalProfitUSD += execution.totalProfit;
    this.metrics.totalFeesUSD += execution.totalFees;
    
    this.logger.debug(`Recording execution completion: ${execution.opportunityId}`);
  }

  public recordExecutionFailure(execution: ArbitrageExecution, error: Error): void {
    this.metrics.totalTrades++;
    this.logger.debug(`Recording execution failure: ${execution.opportunityId}`);
  }

  public update(): void {
    // Update metrics calculations
    this.logger.debug('Performance metrics updated');
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}
