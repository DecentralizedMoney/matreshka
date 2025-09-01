import { MatreshkaConfig } from '../types';
import { Logger } from '../utils/Logger';
import Joi from 'joi';

const logger = new Logger('ProductionConfig');

// Validation schemas
const exchangeConfigSchema = Joi.object({
  id: Joi.string().required(),
  enabled: Joi.boolean().required(),
  weight: Joi.number().min(1).max(10).required(),
  credentials: Joi.object({
    apiKey: Joi.string().required(),
    apiSecret: Joi.string().required(),
    passphrase: Joi.string().optional(),
  }).required(),
  limits: Joi.object({
    maxPositionUSD: Joi.number().positive().required(),
    maxDailyVolumeUSD: Joi.number().positive().required(),
  }).required(),
});

const strategyConfigSchema = Joi.object({
  name: Joi.string().required(),
  enabled: Joi.boolean().required(),
  type: Joi.string().valid('simple_arbitrage', 'triangular', 'funding_rate', 'volatility').required(),
  params: Joi.object().required(),
  exchanges: Joi.array().items(Joi.string()).min(1).required(),
  symbols: Joi.array().items(Joi.string()).min(1).required(),
  minProfitPercent: Joi.number().positive().required(),
  maxPositionSize: Joi.number().positive().required(),
});

const configSchema = Joi.object({
  exchanges: Joi.array().items(exchangeConfigSchema).min(1).required(),
  strategies: Joi.array().items(strategyConfigSchema).min(1).required(),
  risk: Joi.object({
    maxTotalExposureUSD: Joi.number().positive().required(),
    maxLossPerDayUSD: Joi.number().positive().required(),
    maxPositionAgeHours: Joi.number().positive().required(),
    stopLossPercent: Joi.number().positive().max(100).required(),
    emergencyExitEnabled: Joi.boolean().required(),
    correlationThreshold: Joi.number().min(0).max(1).required(),
    volatilityThreshold: Joi.number().positive().required(),
  }).required(),
  portfolio: Joi.object({
    targetAllocations: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(1)).required(),
    rebalanceThreshold: Joi.number().positive().required(),
    emergencyAssets: Joi.array().items(Joi.string()).required(),
    minCashReserve: Joi.number().positive().required(),
  }).required(),
  hummingbot: Joi.object({
    instances: Joi.array().items(Joi.object()).required(),
    communication: Joi.object({
      host: Joi.string().required(),
      port: Joi.number().port().required(),
      apiKey: Joi.string().required(),
    }).required(),
  }).required(),
});

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: MatreshkaConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  public loadConfiguration(): MatreshkaConfig {
    if (this.config) {
      return this.config;
    }

    logger.info('Loading production configuration...');

    // Validate environment variables
    this.validateEnvironmentVariables();

    const config: MatreshkaConfig = {
      exchanges: this.buildExchangeConfigs(),
      strategies: this.buildStrategyConfigs(),
      risk: this.buildRiskConfig(),
      portfolio: this.buildPortfolioConfig(),
      hummingbot: this.buildHummingbotConfig(),
    };

    // Validate the complete configuration
    const { error } = configSchema.validate(config);
    if (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }

    this.config = config;
    logger.info('Configuration loaded and validated successfully');
    
    return config;
  }

  private validateEnvironmentVariables(): void {
    const requiredVars = [
      'NODE_ENV',
      'LOG_LEVEL',
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Validate NODE_ENV
    const validEnvs = ['development', 'staging', 'production'];
    if (!validEnvs.includes(process.env['NODE_ENV']!)) {
      throw new Error(`Invalid NODE_ENV. Must be one of: ${validEnvs.join(', ')}`);
    }
  }

  private buildExchangeConfigs() {
    const exchanges = [];

    // WhiteBIT Configuration
    if (process.env['WHITEBIT_API_KEY'] && process.env['WHITEBIT_API_SECRET']) {
      exchanges.push({
        id: 'whitebit',
        enabled: process.env['WHITEBIT_ENABLED'] === 'true',
        weight: parseInt(process.env['WHITEBIT_WEIGHT'] || '2'),
        credentials: {
          apiKey: process.env['WHITEBIT_API_KEY'],
          apiSecret: process.env['WHITEBIT_API_SECRET'],
        },
        limits: {
          maxPositionUSD: parseInt(process.env['WHITEBIT_MAX_POSITION'] || '10000'),
          maxDailyVolumeUSD: parseInt(process.env['WHITEBIT_MAX_DAILY_VOLUME'] || '100000'),
        },
      });
    }

    // Binance Spot Configuration
    if (process.env['BINANCE_API_KEY'] && process.env['BINANCE_API_SECRET']) {
      exchanges.push({
        id: 'binance',
        enabled: process.env['BINANCE_ENABLED'] === 'true',
        weight: parseInt(process.env['BINANCE_WEIGHT'] || '3'),
        credentials: {
          apiKey: process.env['BINANCE_API_KEY'],
          apiSecret: process.env['BINANCE_API_SECRET'],
        },
        limits: {
          maxPositionUSD: parseInt(process.env['BINANCE_MAX_POSITION'] || '50000'),
          maxDailyVolumeUSD: parseInt(process.env['BINANCE_MAX_DAILY_VOLUME'] || '500000'),
        },
      });
    }

    // Binance Futures Configuration
    if (process.env['BINANCE_FUTURES_API_KEY'] && process.env['BINANCE_FUTURES_API_SECRET']) {
      exchanges.push({
        id: 'binance_perpetual',
        enabled: process.env['BINANCE_FUTURES_ENABLED'] === 'true',
        weight: parseInt(process.env['BINANCE_FUTURES_WEIGHT'] || '5'),
        credentials: {
          apiKey: process.env['BINANCE_FUTURES_API_KEY'],
          apiSecret: process.env['BINANCE_FUTURES_API_SECRET'],
        },
        limits: {
          maxPositionUSD: parseInt(process.env['BINANCE_FUTURES_MAX_POSITION'] || '25000'),
          maxDailyVolumeUSD: parseInt(process.env['BINANCE_FUTURES_MAX_DAILY_VOLUME'] || '250000'),
        },
      });
    }

    // OKX Configuration
    if (process.env['OKX_API_KEY'] && process.env['OKX_API_SECRET'] && process.env['OKX_PASSPHRASE']) {
      exchanges.push({
        id: 'okx',
        enabled: process.env['OKX_ENABLED'] === 'true',
        weight: parseInt(process.env['OKX_WEIGHT'] || '2'),
        credentials: {
          apiKey: process.env['OKX_API_KEY'],
          apiSecret: process.env['OKX_API_SECRET'],
          passphrase: process.env['OKX_PASSPHRASE'],
        },
        limits: {
          maxPositionUSD: parseInt(process.env['OKX_MAX_POSITION'] || '20000'),
          maxDailyVolumeUSD: parseInt(process.env['OKX_MAX_DAILY_VOLUME'] || '200000'),
        },
      });
    }

    if (exchanges.length === 0) {
      logger.warn('No exchange configurations found, using demo mode');
      // Return minimal config for demo mode
      return [{
        id: 'demo',
        enabled: true,
        weight: 1,
        credentials: { apiKey: 'demo', apiSecret: 'demo' },
        limits: { maxPositionUSD: 1000, maxDailyVolumeUSD: 10000 },
      }];
    }

    return exchanges;
  }

  private buildStrategyConfigs() {
    const strategies = [];

    // Simple Arbitrage Strategy
    if (process.env['STRATEGY_SIMPLE_ARBITRAGE_ENABLED'] === 'true') {
      strategies.push({
        name: 'Simple BTC/ETH Arbitrage',
        enabled: true,
        type: 'simple_arbitrage' as const,
        params: {
          maxSpread: parseFloat(process.env['SIMPLE_ARB_MAX_SPREAD'] || '2.0'),
          minVolume: parseInt(process.env['SIMPLE_ARB_MIN_VOLUME'] || '1000'),
        },
        exchanges: (process.env['SIMPLE_ARB_EXCHANGES'] || 'whitebit,binance,okx').split(','),
        symbols: (process.env['SIMPLE_ARB_SYMBOLS'] || 'BTC/USDT,ETH/USDT').split(','),
        minProfitPercent: parseFloat(process.env['SIMPLE_ARB_MIN_PROFIT'] || '0.5'),
        maxPositionSize: parseInt(process.env['SIMPLE_ARB_MAX_POSITION'] || '5000'),
      });
    }

    // Funding Rate Strategy
    if (process.env['STRATEGY_FUNDING_RATE_ENABLED'] === 'true') {
      strategies.push({
        name: 'Spot-Perpetual Arbitrage',
        enabled: true,
        type: 'funding_rate' as const,
        params: {
          minFundingRate: parseFloat(process.env['FUNDING_RATE_MIN'] || '0.01'),
          maxHoldingPeriod: parseInt(process.env['FUNDING_RATE_MAX_HOLDING'] || String(8 * 60 * 60)),
        },
        exchanges: (process.env['FUNDING_RATE_EXCHANGES'] || 'binance,binance_perpetual').split(','),
        symbols: (process.env['FUNDING_RATE_SYMBOLS'] || 'BTC/USDT,ETH/USDT').split(','),
        minProfitPercent: parseFloat(process.env['FUNDING_RATE_MIN_PROFIT'] || '1.0'),
        maxPositionSize: parseInt(process.env['FUNDING_RATE_MAX_POSITION'] || '10000'),
      });
    }

    // Triangular Arbitrage Strategy
    if (process.env['STRATEGY_TRIANGULAR_ENABLED'] === 'true') {
      strategies.push({
        name: 'Triangular Arbitrage',
        enabled: false, // Disabled by default due to complexity
        type: 'triangular' as const,
        params: {
          maxSteps: parseInt(process.env['TRIANGULAR_MAX_STEPS'] || '3'),
          minLiquidity: parseInt(process.env['TRIANGULAR_MIN_LIQUIDITY'] || '5000'),
        },
        exchanges: (process.env['TRIANGULAR_EXCHANGES'] || 'binance').split(','),
        symbols: (process.env['TRIANGULAR_SYMBOLS'] || 'BTC/USDT,ETH/USDT,ETH/BTC').split(','),
        minProfitPercent: parseFloat(process.env['TRIANGULAR_MIN_PROFIT'] || '0.3'),
        maxPositionSize: parseInt(process.env['TRIANGULAR_MAX_POSITION'] || '2000'),
      });
    }

    // Default strategy for demo mode
    if (strategies.length === 0) {
      strategies.push({
        name: 'Demo Strategy',
        enabled: true,
        type: 'simple_arbitrage' as const,
        params: { maxSpread: 2.0, minVolume: 100 },
        exchanges: ['demo'],
        symbols: ['BTC/USDT', 'ETH/USDT'],
        minProfitPercent: 0.1,
        maxPositionSize: 1000,
      });
    }

    // Oil Arbitrage Strategy
    strategies.push({
      name: 'Oil Calendar Spread Arbitrage',
      enabled: true,
      type: 'oil_arbitrage' as const,
      params: {
        maxSpread: parseFloat(process.env['OIL_ARB_MAX_SPREAD'] || '1.0'),
        minVolume: parseInt(process.env['OIL_ARB_MIN_VOLUME'] || '1000'),
        contracts: ['BRENT-2024-01', 'BRENT-2024-02', 'WTI-2024-01', 'WTI-2024-02'],
      },
      exchanges: (process.env['OIL_ARB_EXCHANGES'] || 'ICE,NYMEX').split(','),
      symbols: (process.env['OIL_ARB_SYMBOLS'] || 'BRENT,WTI').split(','),
      minProfitPercent: parseFloat(process.env['OIL_ARB_MIN_PROFIT'] || '0.8'),
      maxPositionSize: parseInt(process.env['OIL_ARB_MAX_POSITION'] || '10000'),
    });

    // Oil Spread Strategy
    strategies.push({
      name: 'Oil Location Arbitrage',
      enabled: true,
      type: 'oil_spread' as const,
      params: {
        maxSpread: parseFloat(process.env['OIL_SPREAD_MAX_SPREAD'] || '2.0'),
        minVolume: parseInt(process.env['OIL_SPREAD_MIN_VOLUME'] || '1000'),
        spreadTypes: ['calendar', 'location', 'crack'],
      },
      exchanges: (process.env['OIL_SPREAD_EXCHANGES'] || 'ICE,NYMEX').split(','),
      symbols: (process.env['OIL_SPREAD_SYMBOLS'] || 'BRENT,WTI').split(','),
      minProfitPercent: parseFloat(process.env['OIL_SPREAD_MIN_PROFIT'] || '1.2'),
      maxPositionSize: parseInt(process.env['OIL_SPREAD_MAX_POSITION'] || '15000'),
    });

    return strategies;
  }

  private buildRiskConfig() {
    return {
      maxTotalExposureUSD: parseInt(process.env['RISK_MAX_EXPOSURE'] || '100000'),
      maxLossPerDayUSD: parseInt(process.env['RISK_MAX_DAILY_LOSS'] || '5000'),
      maxPositionAgeHours: parseInt(process.env['RISK_MAX_POSITION_AGE'] || '24'),
      stopLossPercent: parseFloat(process.env['RISK_STOP_LOSS'] || '5.0'),
      emergencyExitEnabled: process.env['RISK_EMERGENCY_EXIT'] === 'true',
      correlationThreshold: parseFloat(process.env['RISK_CORRELATION_THRESHOLD'] || '0.8'),
      volatilityThreshold: parseFloat(process.env['RISK_VOLATILITY_THRESHOLD'] || '0.1'),
    };
  }

  private buildPortfolioConfig() {
    // Parse target allocations from environment
    const defaultAllocations = { 'USDT': 0.4, 'BTC': 0.3, 'ETH': 0.2, 'BRICS': 0.1 };
    let targetAllocations = defaultAllocations;

    if (process.env['PORTFOLIO_ALLOCATIONS']) {
      try {
        targetAllocations = JSON.parse(process.env['PORTFOLIO_ALLOCATIONS']);
      } catch (error) {
        logger.warn('Invalid PORTFOLIO_ALLOCATIONS format, using default', { error });
      }
    }

    return {
      targetAllocations,
      rebalanceThreshold: parseFloat(process.env['PORTFOLIO_REBALANCE_THRESHOLD'] || '0.1'),
      emergencyAssets: (process.env['PORTFOLIO_EMERGENCY_ASSETS'] || 'USDT,USDC').split(','),
      minCashReserve: parseInt(process.env['PORTFOLIO_MIN_CASH_RESERVE'] || '10000'),
    };
  }

  private buildHummingbotConfig() {
    return {
      instances: [], // Will be populated based on actual Hummingbot setup
      communication: {
        host: process.env['HUMMINGBOT_HOST'] || 'localhost',
        port: parseInt(process.env['HUMMINGBOT_PORT'] || '8080'),
        apiKey: process.env['HUMMINGBOT_API_KEY'] || 'default-api-key',
      },
    };
  }

  public updateConfig(partialConfig: Partial<MatreshkaConfig>): void {
    if (!this.config) {
      throw new Error('Configuration not loaded yet');
    }

    this.config = { ...this.config, ...partialConfig };
    
    // Re-validate the configuration
    const { error } = configSchema.validate(this.config);
    if (error) {
      throw new Error(`Configuration update validation failed: ${error.message}`);
    }

    logger.info('Configuration updated successfully');
  }

  public getConfig(): MatreshkaConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded yet');
    }
    return this.config;
  }

  public isDemoMode(): boolean {
    return process.env['DEMO_MODE'] === 'true' || !process.env['BINANCE_API_KEY'];
  }

  public isProduction(): boolean {
    return process.env['NODE_ENV'] === 'production';
  }

  public isDevelopment(): boolean {
    return process.env['NODE_ENV'] === 'development';
  }
}

// Export singleton instance
export const configManager = ConfigurationManager.getInstance();
