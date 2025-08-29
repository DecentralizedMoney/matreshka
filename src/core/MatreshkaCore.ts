import { EventEmitter } from 'events';
import { MatreshkaConfig, SystemStatus, ArbitrageOpportunity, ArbitrageExecution } from '../types';
import { ExchangeManager } from './ExchangeManager';
import { OpportunityScanner } from './OpportunityScanner';
import { ExecutionEngine } from './ExecutionEngine';
import { RiskManager } from './RiskManager';
import { PortfolioManager } from './PortfolioManager';
import { HummingbotConnector } from './HummingbotConnector';
import { MarketDataManager } from './MarketDataManager';
import { PerformanceTracker } from './PerformanceTracker';
import { Logger } from '../utils/Logger';

export class MatreshkaCore extends EventEmitter {
  private config: MatreshkaConfig;
  private logger: Logger;
  private isRunning: boolean = false;

  // Core managers
  private exchangeManager: ExchangeManager;
  private marketDataManager: MarketDataManager;
  private opportunityScanner: OpportunityScanner;
  private executionEngine: ExecutionEngine;
  private riskManager: RiskManager;
  private portfolioManager: PortfolioManager;
  private hummingbotConnector: HummingbotConnector;
  private performanceTracker: PerformanceTracker;

  private heartbeatInterval?: NodeJS.Timeout;
  private mainLoopInterval?: NodeJS.Timeout;

  constructor(config: MatreshkaConfig) {
    super();
    this.config = config;
    this.logger = new Logger('MatreshkaCore');
    
    this.initializeManagers();
  }

  private initializeManagers(): void {
    this.logger.info('Initializing Matreshka system managers...');

    // Initialize all core managers
    this.exchangeManager = new ExchangeManager(this.config.exchanges);
    this.marketDataManager = new MarketDataManager(this.exchangeManager);
    this.riskManager = new RiskManager(this.config.risk);
    this.portfolioManager = new PortfolioManager(this.config.portfolio, this.exchangeManager);
    this.hummingbotConnector = new HummingbotConnector(this.config.hummingbot);
    this.performanceTracker = new PerformanceTracker();

    // Initialize scanners and engines
    this.opportunityScanner = new OpportunityScanner(
      this.config.strategies,
      this.marketDataManager,
      this.riskManager
    );

    this.executionEngine = new ExecutionEngine(
      this.exchangeManager,
      this.riskManager,
      this.hummingbotConnector
    );

    this.setupEventHandlers();
    this.logger.info('All managers initialized successfully');
  }

  private setupEventHandlers(): void {
    // Opportunity detection events
    this.opportunityScanner.on('opportunityFound', this.handleOpportunityFound.bind(this));
    this.opportunityScanner.on('opportunityExpired', this.handleOpportunityExpired.bind(this));

    // Execution events
    this.executionEngine.on('executionStarted', this.handleExecutionStarted.bind(this));
    this.executionEngine.on('executionCompleted', this.handleExecutionCompleted.bind(this));
    this.executionEngine.on('executionFailed', this.handleExecutionFailed.bind(this));

    // Risk management events
    this.riskManager.on('riskLimitExceeded', this.handleRiskLimitExceeded.bind(this));
    this.riskManager.on('emergencyStop', this.handleEmergencyStop.bind(this));

    // Portfolio events
    this.portfolioManager.on('rebalanceRequired', this.handleRebalanceRequired.bind(this));
    this.portfolioManager.on('lowBalance', this.handleLowBalance.bind(this));

    // Exchange events
    this.exchangeManager.on('connectionLost', this.handleConnectionLost.bind(this));
    this.exchangeManager.on('connectionRestored', this.handleConnectionRestored.bind(this));

    // Market data events
    this.marketDataManager.on('priceAlert', this.handlePriceAlert.bind(this));
    this.marketDataManager.on('volumeSpike', this.handleVolumeSpike.bind(this));

    // Hummingbot events
    this.hummingbotConnector.on('strategyUpdate', this.handleStrategyUpdate.bind(this));
    this.hummingbotConnector.on('hummingbotError', this.handleHummingbotError.bind(this));
  }

  public async start(): Promise<void> {
    try {
      this.logger.info('Starting Matreshka Arbitrage System...');

      if (this.isRunning) {
        throw new Error('System is already running');
      }

      // Start all managers in sequence
      await this.exchangeManager.initialize();
      await this.marketDataManager.start();
      await this.portfolioManager.initialize();
      await this.hummingbotConnector.connect();

      // Start core processes
      this.startOpportunityScanning();
      this.startHeartbeat();
      this.startMainLoop();

      this.isRunning = true;
      this.logger.info('🚀 Matreshka system started successfully');
      this.emit('systemStarted');

    } catch (error) {
      this.logger.error('Failed to start Matreshka system:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      this.logger.info('Stopping Matreshka system...');

      this.isRunning = false;

      // Stop all intervals
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      if (this.mainLoopInterval) clearInterval(this.mainLoopInterval);

      // Stop all managers
      await this.opportunityScanner.stop();
      await this.executionEngine.stop();
      await this.marketDataManager.stop();
      await this.hummingbotConnector.disconnect();
      await this.exchangeManager.cleanup();

      this.logger.info('✅ Matreshka system stopped successfully');
      this.emit('systemStopped');

    } catch (error) {
      this.logger.error('Error stopping Matreshka system:', error);
      throw error;
    }
  }

  private startOpportunityScanning(): void {
    this.opportunityScanner.start();
    this.logger.info('Opportunity scanning started');
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.emit('heartbeat', {
        timestamp: new Date(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        isRunning: this.isRunning
      });
    }, 30000); // Every 30 seconds

    this.logger.info('System heartbeat started');
  }

  private startMainLoop(): void {
    this.mainLoopInterval = setInterval(async () => {
      try {
        await this.runMainLoop();
      } catch (error) {
        this.logger.error('Error in main loop:', error);
      }
    }, 5000); // Every 5 seconds

    this.logger.info('Main system loop started');
  }

  private async runMainLoop(): Promise<void> {
    // Update portfolio balances
    await this.portfolioManager.updateBalances();

    // Check risk limits
    await this.riskManager.checkLimits();

    // Update performance metrics
    this.performanceTracker.update();

    // Check Hummingbot strategies status
    await this.hummingbotConnector.checkStrategies();

    // Emit system status
    this.emit('systemStatus', await this.getSystemStatus());
  }

  // Event handlers
  private async handleOpportunityFound(opportunity: ArbitrageOpportunity): Promise<void> {
    this.logger.info(`New arbitrage opportunity found: ${opportunity.id}, profit: ${opportunity.profitPercent.toFixed(4)}%`);

    // Risk assessment
    const riskApproval = await this.riskManager.assessOpportunity(opportunity);
    if (!riskApproval.approved) {
      this.logger.warn(`Opportunity rejected by risk manager: ${riskApproval.reason}`);
      return;
    }

    // Portfolio check
    const portfolioApproval = await this.portfolioManager.canExecuteOpportunity(opportunity);
    if (!portfolioApproval.canExecute) {
      this.logger.warn(`Opportunity rejected by portfolio manager: ${portfolioApproval.reason}`);
      return;
    }

    // Execute opportunity
    try {
      await this.executionEngine.executeOpportunity(opportunity);
    } catch (error) {
      this.logger.error(`Failed to execute opportunity ${opportunity.id}:`, error);
    }
  }

  private handleOpportunityExpired(opportunityId: string): void {
    this.logger.debug(`Opportunity expired: ${opportunityId}`);
  }

  private handleExecutionStarted(execution: ArbitrageExecution): void {
    this.logger.info(`Execution started: ${execution.opportunityId}`);
    this.performanceTracker.recordExecutionStart(execution);
    this.emit('executionStarted', execution);
  }

  private handleExecutionCompleted(execution: ArbitrageExecution): void {
    this.logger.info(`Execution completed: ${execution.opportunityId}, profit: $${execution.totalProfit.toFixed(2)}`);
    this.performanceTracker.recordExecutionComplete(execution);
    this.emit('executionCompleted', execution);
  }

  private handleExecutionFailed(execution: ArbitrageExecution, error: Error): void {
    this.logger.error(`Execution failed: ${execution.opportunityId}`, error);
    this.performanceTracker.recordExecutionFailure(execution, error);
    this.emit('executionFailed', { execution, error });
  }

  private async handleRiskLimitExceeded(limit: string, value: number): Promise<void> {
    this.logger.warn(`Risk limit exceeded: ${limit} = ${value}`);
    
    // Temporarily pause opportunity scanning
    this.opportunityScanner.pause();
    
    // Notify external systems
    this.emit('riskAlert', { limit, value, timestamp: new Date() });
    
    // Auto-resume after cooldown period
    setTimeout(() => {
      this.opportunityScanner.resume();
      this.logger.info('Opportunity scanning resumed after risk cooldown');
    }, 60000); // 1 minute cooldown
  }

  private async handleEmergencyStop(): Promise<void> {
    this.logger.error('EMERGENCY STOP TRIGGERED');
    
    try {
      // Stop all active executions
      await this.executionEngine.emergencyStop();
      
      // Stop opportunity scanning
      this.opportunityScanner.stop();
      
      // Close all positions if configured
      if (this.config.risk.emergencyExitEnabled) {
        await this.portfolioManager.emergencyExit();
      }
      
      this.emit('emergencyStop', { timestamp: new Date() });
      
    } catch (error) {
      this.logger.error('Error during emergency stop:', error);
    }
  }

  private async handleRebalanceRequired(targetAllocations: Record<string, number>): Promise<void> {
    this.logger.info('Portfolio rebalancing required');
    
    try {
      await this.portfolioManager.rebalance(targetAllocations);
      this.logger.info('Portfolio rebalanced successfully');
    } catch (error) {
      this.logger.error('Portfolio rebalancing failed:', error);
    }
  }

  private handleLowBalance(exchange: string, asset: string, balance: number): void {
    this.logger.warn(`Low balance detected: ${exchange} ${asset} = ${balance}`);
    this.emit('lowBalance', { exchange, asset, balance, timestamp: new Date() });
  }

  private handleConnectionLost(exchangeId: string): void {
    this.logger.error(`Connection lost to exchange: ${exchangeId}`);
    this.emit('connectionLost', { exchangeId, timestamp: new Date() });
  }

  private handleConnectionRestored(exchangeId: string): void {
    this.logger.info(`Connection restored to exchange: ${exchangeId}`);
    this.emit('connectionRestored', { exchangeId, timestamp: new Date() });
  }

  private handlePriceAlert(symbol: string, exchange: string, price: number, change: number): void {
    this.logger.info(`Price alert: ${symbol} on ${exchange} = $${price} (${change.toFixed(2)}%)`);
    this.emit('priceAlert', { symbol, exchange, price, change, timestamp: new Date() });
  }

  private handleVolumeSpike(symbol: string, exchange: string, volume: number, spike: number): void {
    this.logger.info(`Volume spike: ${symbol} on ${exchange} = ${volume} (${spike.toFixed(2)}x normal)`);
    this.emit('volumeSpike', { symbol, exchange, volume, spike, timestamp: new Date() });
  }

  private handleStrategyUpdate(instanceId: string, status: string, data: any): void {
    this.logger.debug(`Hummingbot strategy update: ${instanceId} = ${status}`);
    this.emit('strategyUpdate', { instanceId, status, data, timestamp: new Date() });
  }

  private handleHummingbotError(instanceId: string, error: Error): void {
    this.logger.error(`Hummingbot error in ${instanceId}:`, error);
    this.emit('hummingbotError', { instanceId, error, timestamp: new Date() });
  }

  // Public API methods
  public async getSystemStatus(): Promise<SystemStatus> {
    return {
      uptime: process.uptime(),
      activeConnections: this.exchangeManager.getActiveConnections(),
      lastHeartbeat: new Date(),
      errors: [], // TODO: Implement error collection
      performance: this.performanceTracker.getMetrics(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage().user / 1000000 // Convert to seconds
    };
  }

  public getActiveOpportunities(): ArbitrageOpportunity[] {
    return this.opportunityScanner.getActiveOpportunities();
  }

  public getActiveExecutions(): ArbitrageExecution[] {
    return this.executionEngine.getActiveExecutions();
  }

  public async getPortfolioSnapshot(): Promise<any> {
    return await this.portfolioManager.getSnapshot();
  }

  public async updateConfig(newConfig: Partial<MatreshkaConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Configuration updated');
    this.emit('configUpdated', this.config);
  }

  public isSystemRunning(): boolean {
    return this.isRunning;
  }
}
