// Core types for Matreshka Arbitrage System

export interface Exchange {
  id: string;
  name: string;
  type: 'cex' | 'dex' | 'perpetual' | 'wm'; // WebMoney type
  api: ExchangeAPI;
  fees: ExchangeFees;
  limits: ExchangeLimits;
  status: 'active' | 'inactive' | 'maintenance';
}

export interface ExchangeAPI {
  baseUrl: string;
  wsUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  testnet: boolean;
}

export interface ExchangeFees {
  maker: number;
  taker: number;
  withdraw: Record<string, number>;
  deposit: Record<string, number>;
}

export interface ExchangeLimits {
  minTradeAmount: Record<string, number>;
  maxTradeAmount: Record<string, number>;
  minWithdraw: Record<string, number>;
  maxWithdraw: Record<string, number>;
}

export interface TradingPair {
  symbol: string;
  base: string;
  quote: string;
  exchange: string;
  active: boolean;
  precision: {
    amount: number;
    price: number;
  };
}

export interface OrderBook {
  symbol: string;
  exchange: string;
  bids: [number, number][]; // [price, amount]
  asks: [number, number][];
  timestamp: number;
  nonce?: string;
}

export interface Ticker {
  symbol: string;
  exchange: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  change24h: number;
  timestamp: number;
}

export interface ArbitrageOpportunity {
  id: string;
  type: 'simple' | 'triangular' | 'cross_exchange' | 'perpetual_spot';
  profit: number;
  profitPercent: number;
  volume: number;
  paths: TradePath[];
  estimatedDuration: number; // seconds
  confidence: number; // 0-1
  risks: RiskFactor[];
  created: Date;
  expires: Date;
}

export interface TradePath {
  step: number;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  fee: number;
  estimatedTime: number; // ms
}

export interface RiskFactor {
  type: 'liquidity' | 'volatility' | 'exchange' | 'network' | 'timing';
  severity: 'low' | 'medium' | 'high';
  description: string;
  impact: number; // 0-1
}

export interface ArbitrageExecution {
  opportunityId: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  trades: TradeExecution[];
  totalProfit: number;
  totalFees: number;
  executionTime: number; // ms
  startTime: Date;
  endTime?: Date;
  errors?: string[];
}

export interface TradeExecution {
  id: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  filledAmount: number;
  averagePrice: number;
  fee: number;
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
  orderId?: string;
  timestamp: Date;
}

export interface Portfolio {
  exchange: string;
  balances: Record<string, Balance>;
  totalValueUSD: number;
  lastUpdate: Date;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  valueUSD: number;
}

export interface MatreshkaConfig {
  exchanges: ExchangeConfig[];
  strategies: StrategyConfig[];
  risk: RiskConfig;
  portfolio: PortfolioConfig;
  hummingbot: HummingbotConfig;
}

export interface ExchangeConfig {
  id: string;
  enabled: boolean;
  weight: number; // 1-10, влияние на распределение объемов
  credentials: {
    apiKey: string;
    apiSecret: string;
    passphrase?: string;
  };
  limits: {
    maxPositionUSD: number;
    maxDailyVolumeUSD: number;
  };
}

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  type: 'simple_arbitrage' | 'triangular' | 'funding_rate' | 'volatility';
  params: Record<string, any>;
  exchanges: string[];
  symbols: string[];
  minProfitPercent: number;
  maxPositionSize: number;
}

export interface RiskConfig {
  maxTotalExposureUSD: number;
  maxLossPerDayUSD: number;
  maxPositionAgeHours: number;
  stopLossPercent: number;
  emergencyExitEnabled: boolean;
  correlationThreshold: number;
  volatilityThreshold: number;
}

export interface PortfolioConfig {
  targetAllocations: Record<string, number>; // asset -> percent
  rebalanceThreshold: number;
  emergencyAssets: string[]; // safe haven assets
  minCashReserve: number; // minimum USD equivalent to keep
}

export interface HummingbotConfig {
  instances: HummingbotInstance[];
  communication: {
    host: string;
    port: number;
    apiKey: string;
  };
}

export interface HummingbotInstance {
  id: string;
  name: string;
  strategy: string;
  exchange: string;
  symbol: string;
  config: Record<string, any>;
  status: 'running' | 'stopped' | 'error';
  assignedRole: 'maker' | 'taker' | 'monitor';
}

export interface MarketData {
  symbol: string;
  exchange: string;
  type: 'orderbook' | 'ticker' | 'trade' | 'candle';
  data: any;
  timestamp: number;
}

export interface ArbitrageSignal {
  type: 'opportunity' | 'execution' | 'completion' | 'error';
  data: any;
  timestamp: Date;
  source: string;
}

export interface OpportunityScanner {
  scanInterval: number; // ms
  enabledStrategies: string[];
  minProfitThreshold: number;
  maxOpportunities: number;
}

export interface ExecutionEngine {
  maxConcurrentTrades: number;
  orderTimeoutMs: number;
  retryAttempts: number;
  enablePartialFills: boolean;
}

export interface PerformanceMetrics {
  totalTrades: number;
  successfulTrades: number;
  totalProfitUSD: number;
  totalFeesUSD: number;
  averageExecutionTime: number;
  bestOpportunityProfit: number;
  worstOpportunityProfit: number;
  dailyPnL: number[];
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface SystemStatus {
  uptime: number;
  activeConnections: number;
  lastHeartbeat: Date;
  errors: ErrorLog[];
  performance: PerformanceMetrics;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
}

export interface ErrorLog {
  timestamp: Date;
  level: 'error' | 'warning' | 'info';
  message: string;
  source: string;
  stack?: string;
}
