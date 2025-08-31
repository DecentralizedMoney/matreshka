import { EventEmitter } from 'events';
import { ArbitrageExecution, PerformanceMetrics } from '../types';
import { Logger } from '../utils/Logger';

export class PerformanceTracker extends EventEmitter {
  private logger: Logger;
  private executions: ArbitrageExecution[] = [];
  private dailyProfits: Map<string, number> = new Map(); // date -> profit
  private startTime: Date;
  private totalTrades: number = 0;
  private successfulTrades: number = 0;
  private totalProfitUSD: number = 0;
  private totalFeesUSD: number = 0;
  private executionTimes: number[] = [];
  private profits: number[] = [];

  // Risk metrics
  private dailyReturns: number[] = [];
  private peakValue: number = 0;
  private maxDrawdown: number = 0;

  constructor() {
    super();
    this.logger = new Logger('PerformanceTracker');
    this.startTime = new Date();
    
    // Initialize daily tracking
    this.initializeDailyTracking();
  }

  private initializeDailyTracking(): void {
    // Reset daily stats at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.resetDailyStats();
      
      // Set up daily reset interval
      setInterval(() => {
        this.resetDailyStats();
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntilMidnight);
  }

  public recordExecutionStart(execution: ArbitrageExecution): void {
    this.logger.debug(`Recording execution start: ${execution.opportunityId}`);
    this.totalTrades++;
  }

  public recordExecutionComplete(execution: ArbitrageExecution): void {
    this.logger.debug(`Recording execution completion: ${execution.opportunityId}`);
    
    this.successfulTrades++;
    this.totalProfitUSD += execution.totalProfit;
    this.totalFeesUSD += execution.totalFees;
    
    if (execution.executionTime > 0) {
      this.executionTimes.push(execution.executionTime);
    }
    
    this.profits.push(execution.totalProfit);
    this.executions.push(execution);
    
    // Update daily profits
    const today = this.getDateKey(new Date());
    const currentDailyProfit = this.dailyProfits.get(today) || 0;
    this.dailyProfits.set(today, currentDailyProfit + execution.totalProfit);
    
    // Update risk metrics
    this.updateRiskMetrics(execution.totalProfit);
    
    // Emit performance update
    this.emit('performanceUpdate', this.getMetrics());
    
    this.logger.info(`Trade completed: $${execution.totalProfit.toFixed(2)} profit, ${execution.executionTime}ms execution time`);
  }

  public recordExecutionFailure(execution: ArbitrageExecution, error: Error): void {
    this.logger.debug(`Recording execution failure: ${execution.opportunityId}`);
    
    // Record failed execution for analysis
    execution.status = 'failed';
    execution.errors = execution.errors || [];
    execution.errors.push(error.message);
    
    this.executions.push(execution);
    
    // Failed trades still count toward total but not successful
    // totalTrades is already incremented in recordExecutionStart
    
    this.logger.warn(`Trade failed: ${execution.opportunityId} - ${error.message}`);
  }

  private updateRiskMetrics(profit: number): void {
    // Update peak value and drawdown
    this.peakValue = Math.max(this.peakValue, this.totalProfitUSD);
    
    if (this.peakValue > 0) {
      const currentDrawdown = (this.peakValue - this.totalProfitUSD) / this.peakValue;
      this.maxDrawdown = Math.max(this.maxDrawdown, currentDrawdown);
    }
    
    // Add to daily returns for Sharpe ratio calculation
    const profitPercent = profit; // This would need portfolio value context for accurate %
    this.dailyReturns.push(profitPercent);
    
    // Keep only last 30 days of returns
    if (this.dailyReturns.length > 30) {
      this.dailyReturns = this.dailyReturns.slice(-30);
    }
  }

  private calculateSharpeRatio(): number {
    if (this.dailyReturns.length < 2) {
      return 0;
    }
    
    const avgReturn = this.dailyReturns.reduce((sum, ret) => sum + ret, 0) / this.dailyReturns.length;
    const avgSquaredDiff = this.dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / this.dailyReturns.length;
    const stdDev = Math.sqrt(avgSquaredDiff);
    
    if (stdDev === 0) {
      return 0;
    }
    
    // Assuming risk-free rate of 2% annually (converted to daily)
    const riskFreeRate = 0.02 / 365;
    return (avgReturn - riskFreeRate) / stdDev;
  }

  private resetDailyStats(): void {
    const today = this.getDateKey(new Date());
    const todayProfit = this.dailyProfits.get(today) || 0;
    
    this.logger.info(`Daily stats reset. Today's profit: $${todayProfit.toFixed(2)}`);
    
    // Keep last 30 days of data
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    
    for (const [dateKey] of this.dailyProfits) {
      const date = new Date(dateKey);
      if (date < cutoffDate) {
        this.dailyProfits.delete(dateKey);
      }
    }
  }

  private getDateKey(date: Date): string {
    const isoString = date.toISOString().split('T')[0];
    if (!isoString) {
      throw new Error('Invalid date format');
    }
    return isoString; // YYYY-MM-DD format
  }

  public getMetrics(): PerformanceMetrics {
    const avgExecutionTime = this.executionTimes.length > 0 
      ? this.executionTimes.reduce((sum, time) => sum + time, 0) / this.executionTimes.length 
      : 0;

    const bestProfit = this.profits.length > 0 ? Math.max(...this.profits) : 0;
    const worstProfit = this.profits.length > 0 ? Math.min(...this.profits) : 0;

    // Get last 7 days of P&L
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = this.getDateKey(date);
      return this.dailyProfits.get(dateKey) || 0;
    }).reverse();

    return {
      totalTrades: this.totalTrades,
      successfulTrades: this.successfulTrades,
      totalProfitUSD: this.totalProfitUSD,
      totalFeesUSD: this.totalFeesUSD,
      averageExecutionTime: avgExecutionTime,
      bestOpportunityProfit: bestProfit,
      worstOpportunityProfit: worstProfit,
      dailyPnL: last7Days,
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: this.maxDrawdown
    };
  }

  public getDetailedStats(): any {
    const metrics = this.getMetrics();
    const successRate = this.totalTrades > 0 ? (this.successfulTrades / this.totalTrades) * 100 : 0;
    const avgProfitPerTrade = this.successfulTrades > 0 ? this.totalProfitUSD / this.successfulTrades : 0;
    const profitFactor = this.totalFeesUSD > 0 ? this.totalProfitUSD / this.totalFeesUSD : 0;

    return {
      ...metrics,
      successRate,
      avgProfitPerTrade,
      profitFactor,
      uptime: Date.now() - this.startTime.getTime(),
      tradesPerHour: this.calculateTradesPerHour(),
      recentExecutions: this.getRecentExecutions(10),
      topProfitableOpportunities: this.getTopProfitableOpportunities(5),
      riskMetrics: {
        maxDrawdown: this.maxDrawdown,
        sharpeRatio: this.calculateSharpeRatio(),
        volatility: this.calculateVolatility(),
        winRate: successRate
      }
    };
  }

  private calculateTradesPerHour(): number {
    const uptimeHours = (Date.now() - this.startTime.getTime()) / (1000 * 60 * 60);
    return uptimeHours > 0 ? this.totalTrades / uptimeHours : 0;
  }

  private calculateVolatility(): number {
    if (this.profits.length < 2) {
      return 0;
    }
    
    const avgProfit = this.profits.reduce((sum, profit) => sum + profit, 0) / this.profits.length;
    const variance = this.profits.reduce((sum, profit) => sum + Math.pow(profit - avgProfit, 2), 0) / this.profits.length;
    return Math.sqrt(variance);
  }

  private getRecentExecutions(limit: number): ArbitrageExecution[] {
    return this.executions
      .slice(-limit)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  private getTopProfitableOpportunities(limit: number): any[] {
    return this.executions
      .filter(exec => exec.status === 'completed')
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, limit)
      .map(exec => ({
        opportunityId: exec.opportunityId,
        profit: exec.totalProfit,
        executionTime: exec.executionTime,
        timestamp: exec.startTime
      }));
  }

  public update(): void {
    // Called periodically to update metrics
    const metrics = this.getMetrics();
    this.emit('metricsUpdate', metrics);
  }

  // Export/Import for persistence
  public exportData(): any {
    return {
      executions: this.executions,
      dailyProfits: Object.fromEntries(this.dailyProfits),
      startTime: this.startTime,
      totalTrades: this.totalTrades,
      successfulTrades: this.successfulTrades,
      totalProfitUSD: this.totalProfitUSD,
      totalFeesUSD: this.totalFeesUSD,
      peakValue: this.peakValue,
      maxDrawdown: this.maxDrawdown
    };
  }

  public importData(data: any): void {
    if (data.executions) this.executions = data.executions;
    if (data.dailyProfits) this.dailyProfits = new Map(Object.entries(data.dailyProfits));
    if (data.startTime) this.startTime = new Date(data.startTime);
    if (data.totalTrades) this.totalTrades = data.totalTrades;
    if (data.successfulTrades) this.successfulTrades = data.successfulTrades;
    if (data.totalProfitUSD) this.totalProfitUSD = data.totalProfitUSD;
    if (data.totalFeesUSD) this.totalFeesUSD = data.totalFeesUSD;
    if (data.peakValue) this.peakValue = data.peakValue;
    if (data.maxDrawdown) this.maxDrawdown = data.maxDrawdown;

    // Recalculate derived metrics
    this.executionTimes = this.executions
      .filter(exec => exec.executionTime > 0)
      .map(exec => exec.executionTime);
    
    this.profits = this.executions
      .filter(exec => exec.status === 'completed')
      .map(exec => exec.totalProfit);

    this.logger.info('Performance data imported successfully');
  }

  // Alerts and notifications
  public checkPerformanceAlerts(): void {
    const metrics = this.getMetrics();
    
    // Check for unusual performance patterns
    if (metrics.maxDrawdown > 0.1) { // 10% drawdown
      this.emit('performanceAlert', {
        type: 'high_drawdown',
        value: metrics.maxDrawdown,
        message: `High drawdown detected: ${(metrics.maxDrawdown * 100).toFixed(2)}%`
      });
    }
    
    if (this.totalTrades > 0) {
      const successRate = (this.successfulTrades / this.totalTrades) * 100;
      if (successRate < 80) { // Less than 80% success rate
        this.emit('performanceAlert', {
          type: 'low_success_rate',
          value: successRate,
          message: `Low success rate: ${successRate.toFixed(2)}%`
        });
      }
    }
    
    // Check for system performance issues
    if (metrics.averageExecutionTime > 10000) { // More than 10 seconds
      this.emit('performanceAlert', {
        type: 'slow_execution',
        value: metrics.averageExecutionTime,
        message: `Slow execution times: ${(metrics.averageExecutionTime / 1000).toFixed(2)}s average`
      });
    }
  }

  public reset(): void {
    this.logger.info('Resetting performance tracker');
    
    this.executions = [];
    this.dailyProfits.clear();
    this.totalTrades = 0;
    this.successfulTrades = 0;
    this.totalProfitUSD = 0;
    this.totalFeesUSD = 0;
    this.executionTimes = [];
    this.profits = [];
    this.dailyReturns = [];
    this.peakValue = 0;
    this.maxDrawdown = 0;
    this.startTime = new Date();
    
    this.emit('performanceReset');
  }
}