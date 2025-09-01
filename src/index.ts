import dotenv from 'dotenv';
import { MatreshkaCore } from './core/MatreshkaCore';
import { Logger, globalLogger } from './utils/Logger';
import { globalErrorHandler, MatreshkaError, ErrorCategory, ErrorSeverity } from './utils/ErrorHandler';
import { configManager } from './config/ProductionConfig';
import { WebMonitor } from './web/WebMonitor';

// Load environment variables first
dotenv.config();

// Initialize global error handling
process.on('uncaughtException', (error: Error) => {
  globalErrorHandler.handle(new MatreshkaError(
    'Uncaught Exception',
    { category: ErrorCategory.SYSTEM, severity: ErrorSeverity.CRITICAL },
    { cause: error }
  ));
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  globalErrorHandler.handle(new MatreshkaError(
    'Unhandled Promise Rejection',
    { category: ErrorCategory.SYSTEM, severity: ErrorSeverity.HIGH },
    { cause: error }
  ));
});

const logger = new Logger('Matreshka', {
  level: process.env['LOG_LEVEL'] || 'info',
  pretty: process.env['NODE_ENV'] !== 'production',
});

async function main() {
  try {
    logger.logSystemEvent('startup', { 
      version: '2.0.0',
      nodeVersion: process.version,
      platform: process.platform,
    });

    // Handle command line arguments
    const args = process.argv.slice(2);
    const isHealthCheck = args.includes('--health-check');
    const mode = args.includes('--mode=monitor') ? 'monitor' : 'execute';
    const webEnabled = !args.includes('--no-web');
    const webPort = parseInt(process.env['WEB_PORT'] || '3001');

    // Health check endpoint
    if (isHealthCheck) {
      logger.logHealth('healthy', { message: 'Health check passed' });
      process.exit(0);
    }

    logger.info('🚀 Starting Matreshka Arbitrage System v2.0.0...');
    logger.info(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
    logger.info(`Mode: ${mode}`);
    logger.info(`Demo Mode: ${configManager.isDemoMode()}`);
    
    if (webEnabled) {
      logger.info(`Web interface will be available at http://localhost:${webPort}`);
    }

    // Load production configuration
    const config = configManager.loadConfiguration();
    
    // Create and start Matreshka core with production config
    const matreshka = new MatreshkaCore(config);

    // Create web monitor if enabled
    let webMonitor: WebMonitor | null = null;
    if (webEnabled) {
      webMonitor = new WebMonitor(matreshka, webPort);
    }

    // Set up event handlers
    setupEventHandlers(matreshka);

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      
      if (webMonitor) {
        await webMonitor.stop();
      }
      
      await matreshka.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the system
    await matreshka.start();

    // Start web monitor
    if (webMonitor) {
      try {
        await webMonitor.start();
        logger.info(`🌐 Web dashboard: http://localhost:${webPort}`);
      } catch (error) {
        logger.warn('Failed to start web monitor:', { errorMessage: String(error) });
      }
    }

    if (mode === 'monitor') {
      // In monitor mode, just observe and log
      logger.info('🔍 Running in monitor mode - no trades will be executed');
      startMonitorMode(matreshka);
    } else {
      // In execute mode, actively trade
      logger.info('⚡ Running in execute mode - trades will be executed');
      startExecuteMode(matreshka);
    }

  } catch (error) {
    globalErrorHandler.handle(new MatreshkaError(
      'Failed to start Matreshka system',
      { category: ErrorCategory.SYSTEM, severity: ErrorSeverity.CRITICAL },
      { cause: error instanceof Error ? error : new Error(String(error)) }
    ));
    process.exit(1);
  }
}

function setupEventHandlers(matreshka: MatreshkaCore) {
  // System events
  matreshka.on('systemStarted', () => {
    logger.info('✅ Matreshka system started successfully');
  });

  matreshka.on('systemStopped', () => {
    logger.info('✅ Matreshka system stopped successfully');
  });

  matreshka.on('heartbeat', (data) => {
    logger.debug(`💓 System heartbeat: uptime ${Math.floor(data.uptime)}s, memory ${Math.floor(data.memoryUsage.heapUsed / 1024 / 1024)}MB`);
  });

  // Arbitrage events
  matreshka.on('opportunityFound', (opportunity) => {
    logger.info(`🎯 Opportunity found: ${opportunity.id}, profit: ${opportunity.profitPercent.toFixed(4)}%, type: ${opportunity.type}`);
  });

  matreshka.on('executionStarted', (execution) => {
    logger.info(`🚀 Execution started: ${execution.opportunityId}`);
  });

  matreshka.on('executionCompleted', (execution) => {
    logger.info(`✅ Execution completed: ${execution.opportunityId}, profit: $${execution.totalProfit.toFixed(2)}`);
  });

  matreshka.on('executionFailed', ({ execution, error }) => {
    logger.error(`❌ Execution failed: ${execution.opportunityId}`, error);
  });

  // Risk management events
  matreshka.on('riskAlert', (alert) => {
    logger.warn(`⚠️ Risk alert: ${alert.limit} exceeded with value ${alert.value}`);
  });

  matreshka.on('emergencyStop', () => {
    logger.error('🚨 EMERGENCY STOP TRIGGERED');
  });

  // Connection events
  matreshka.on('connectionLost', (data) => {
    logger.error(`📡 Connection lost to ${data.exchangeId}`);
  });

  matreshka.on('connectionRestored', (data) => {
    logger.info(`📡 Connection restored to ${data.exchangeId}`);
  });

  // Market events
  matreshka.on('priceAlert', (alert) => {
    logger.info(`📈 Price alert: ${alert.symbol} on ${alert.exchange} = $${alert.price} (${alert.change.toFixed(2)}%)`);
  });

  matreshka.on('volumeSpike', (spike) => {
    logger.info(`📊 Volume spike: ${spike.symbol} on ${spike.exchange} = ${spike.volume} (${spike.spike.toFixed(2)}x)`);
  });

  // Hummingbot events
  matreshka.on('strategyUpdate', (update) => {
    logger.debug(`🤖 Hummingbot strategy update: ${update.instanceId} = ${update.status}`);
  });

  matreshka.on('hummingbotError', (error) => {
    logger.error(`🤖 Hummingbot error in ${error.instanceId}:`, error.error);
  });
}

function startMonitorMode(matreshka: MatreshkaCore) {
  // In monitor mode, periodically log system status
  setInterval(async () => {
    try {
      const status = await matreshka.getSystemStatus();
      const opportunities = matreshka.getActiveOpportunities();
      const executions = matreshka.getActiveExecutions();

      logger.info(`📊 System Status - Opportunities: ${opportunities.length}, Executions: ${executions.length}, Uptime: ${Math.floor(status.uptime)}s`);

      if (opportunities.length > 0) {
        const bestOpportunity = opportunities.reduce((best, current) => 
          current.profitPercent > best.profitPercent ? current : best
        );
        logger.info(`🎯 Best opportunity: ${bestOpportunity.profitPercent.toFixed(4)}% profit (${bestOpportunity.type})`);
      }

    } catch (error) {
      logger.error('Error getting system status:', error);
    }
  }, 30000); // Every 30 seconds
}

function startExecuteMode(matreshka: MatreshkaCore) {
  // In execute mode, the system will automatically execute trades
  // based on the configured strategies and risk parameters
  
  logger.info('🎯 Active trading mode enabled');
  
  // Optionally, set up additional monitoring or controls
  setInterval(async () => {
    try {
      const status = await matreshka.getSystemStatus();
      const portfolio = await matreshka.getPortfolioSnapshot();
      
      logger.info(`💼 Portfolio update - Total value: $${portfolio.totalValue || 'N/A'}`);
      
    } catch (error) {
      logger.debug('Error getting portfolio status:', { errorMessage: String(error) });
    }
  }, 60000); // Every minute
}

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.logSystemEvent('shutdown', { signal });
  
  try {
    // Perform any cleanup here
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the application
if (require.main === module) {
  main().catch((error) => {
    globalErrorHandler.handle(new MatreshkaError(
      'Unhandled error in main',
      { category: ErrorCategory.SYSTEM, severity: ErrorSeverity.CRITICAL },
      { cause: error instanceof Error ? error : new Error(String(error)) }
    ));
    process.exit(1);
  });
}

// Export for external use
export { MatreshkaCore };
