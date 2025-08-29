import dotenv from 'dotenv';
import { MatreshkaCore } from './core/MatreshkaCore';
import { MatreshkaConfig } from './types';
import { Logger } from './utils/Logger';

// Load environment variables
dotenv.config();

const logger = new Logger('Matreshka');

// Default configuration
const defaultConfig: MatreshkaConfig = {
  exchanges: [
    {
      id: 'whitebit',
      enabled: true,
      weight: 2,
      credentials: {
        apiKey: process.env.WHITEBIT_API_KEY || '',
        apiSecret: process.env.WHITEBIT_API_SECRET || ''
      },
      limits: {
        maxPositionUSD: 10000,
        maxDailyVolumeUSD: 100000
      }
    },
    {
      id: 'binance',
      enabled: true,
      weight: 3,
      credentials: {
        apiKey: process.env.BINANCE_API_KEY || '',
        apiSecret: process.env.BINANCE_API_SECRET || ''
      },
      limits: {
        maxPositionUSD: 50000,
        maxDailyVolumeUSD: 500000
      }
    },
    {
      id: 'binance_perpetual',
      enabled: true,
      weight: 5,
      credentials: {
        apiKey: process.env.BINANCE_FUTURES_API_KEY || '',
        apiSecret: process.env.BINANCE_FUTURES_API_SECRET || ''
      },
      limits: {
        maxPositionUSD: 25000,
        maxDailyVolumeUSD: 250000
      }
    },
    {
      id: 'okx',
      enabled: true,
      weight: 2,
      credentials: {
        apiKey: process.env.OKX_API_KEY || '',
        apiSecret: process.env.OKX_API_SECRET || '',
        passphrase: process.env.OKX_PASSPHRASE || ''
      },
      limits: {
        maxPositionUSD: 20000,
        maxDailyVolumeUSD: 200000
      }
    }
  ],
  strategies: [
    {
      name: 'Simple BTC Arbitrage',
      enabled: true,
      type: 'simple_arbitrage',
      params: {
        maxSpread: 2.0,
        minVolume: 1000
      },
      exchanges: ['whitebit', 'binance', 'okx'],
      symbols: ['BTC/USDT', 'ETH/USDT'],
      minProfitPercent: 0.5,
      maxPositionSize: 5000
    },
    {
      name: 'Spot-Perpetual Arbitrage',
      enabled: true,
      type: 'funding_rate',
      params: {
        minFundingRate: 0.01,
        maxHoldingPeriod: 8 * 60 * 60 // 8 hours
      },
      exchanges: ['binance', 'binance_perpetual'],
      symbols: ['BTC/USDT', 'ETH/USDT'],
      minProfitPercent: 1.0,
      maxPositionSize: 10000
    },
    {
      name: 'Triangular Arbitrage',
      enabled: false, // Disabled by default due to complexity
      type: 'triangular',
      params: {
        maxSteps: 3,
        minLiquidity: 5000
      },
      exchanges: ['binance'],
      symbols: ['BTC/USDT', 'ETH/USDT', 'ETH/BTC'],
      minProfitPercent: 0.3,
      maxPositionSize: 2000
    }
  ],
  risk: {
    maxTotalExposureUSD: 100000,
    maxLossPerDayUSD: 5000,
    maxPositionAgeHours: 24,
    stopLossPercent: 5.0,
    emergencyExitEnabled: true,
    correlationThreshold: 0.8,
    volatilityThreshold: 0.1
  },
  portfolio: {
    targetAllocations: {
      'USDT': 0.4,
      'BTC': 0.3,
      'ETH': 0.2,
      'BRICS': 0.1
    },
    rebalanceThreshold: 0.1,
    emergencyAssets: ['USDT', 'USDC'],
    minCashReserve: 10000
  },
  hummingbot: {
    instances: [
      {
        id: 'hb_maker_1',
        name: 'WhiteBit Maker',
        strategy: 'dman_v2',
        exchange: 'whitebit',
        symbol: 'XRP-USDT',
        config: {
          order_amount: 10,
          n_levels: 3,
          spread_ratio_increase: 2.0
        },
        status: 'stopped',
        assignedRole: 'maker'
      },
      {
        id: 'hb_taker_1',
        name: 'Binance Taker',
        strategy: 'dman_v2',
        exchange: 'binance_perpetual',
        symbol: 'XRP-USDT',
        config: {
          order_amount: 10,
          leverage: 5
        },
        status: 'stopped',
        assignedRole: 'taker'
      },
      {
        id: 'hb_monitor_1',
        name: 'Market Monitor',
        strategy: 'markets_monitor',
        exchange: 'binance',
        symbol: 'BTC-USDT',
        config: {
          monitoring_pairs: ['BTC/USDT', 'ETH/USDT']
        },
        status: 'stopped',
        assignedRole: 'monitor'
      }
    ],
    communication: {
      host: process.env.HUMMINGBOT_HOST || 'localhost',
      port: parseInt(process.env.HUMMINGBOT_PORT || '8080'),
      apiKey: process.env.HUMMINGBOT_API_KEY || 'default-api-key'
    }
  }
};

async function main() {
  try {
    logger.info('🚀 Starting Matreshka Arbitrage System...');

    // Get mode from command line arguments
    const mode = process.argv.includes('--mode=monitor') ? 'monitor' : 'execute';
    logger.info(`Running in ${mode} mode`);

    // Create and start Matreshka core
    const matreshka = new MatreshkaCore(defaultConfig);

    // Set up event handlers
    setupEventHandlers(matreshka);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await matreshka.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await matreshka.stop();
      process.exit(0);
    });

    // Start the system
    await matreshka.start();

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
    logger.error('Failed to start Matreshka:', error);
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
      logger.debug('Error getting portfolio status:', error);
    }
  }, 60000); // Every minute
}

// Start the application
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { MatreshkaCore, defaultConfig };
