import { EventEmitter } from 'events';
import { ExchangeConfig, Exchange } from '../types';
import { Logger } from '../utils/Logger';
import * as ccxt from 'ccxt';

export class ExchangeManager extends EventEmitter {
  private config: ExchangeConfig[];
  private logger: Logger;
  private exchanges: Map<string, ccxt.Exchange> = new Map();
  private connectionStatus: Map<string, boolean> = new Map();

  constructor(config: ExchangeConfig[]) {
    super();
    this.config = config;
    this.logger = new Logger('ExchangeManager');
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing exchange connections...');
    
    // Check if we're in demo mode
    const isDemoMode = process.env['DEMO_MODE'] === 'true' || !process.env['BINANCE_API_KEY'];
    
    if (isDemoMode) {
      this.logger.info('🎭 Running in DEMO mode - simulating exchange connections');
      // Simulate successful connections for all configured exchanges
      for (const exchangeConfig of this.config) {
        if (!exchangeConfig.enabled) continue;
        this.connectionStatus.set(exchangeConfig.id, true);
        this.logger.info(`✅ Simulated connection to ${exchangeConfig.id}`);
      }
      this.logger.info(`🎯 Demo mode: ${this.connectionStatus.size} simulated exchange connections`);
      return;
    }
    
    // Real mode - actual exchange connections
    for (const exchangeConfig of this.config) {
      if (!exchangeConfig.enabled) continue;
      
      try {
        await this.connectToExchange(exchangeConfig);
        this.connectionStatus.set(exchangeConfig.id, true);
        this.logger.info(`✅ Connected to ${exchangeConfig.id}`);
      } catch (error) {
        this.logger.error(`❌ Failed to connect to ${exchangeConfig.id}:`, error);
        this.connectionStatus.set(exchangeConfig.id, false);
        this.emit('connectionLost', exchangeConfig.id);
      }
    }
    
    this.logger.info(`Initialized ${this.exchanges.size} exchange connections`);
    
    // Start connection monitoring
    this.startConnectionMonitoring();
  }

  private async connectToExchange(config: ExchangeConfig): Promise<void> {
    const exchangeClass = this.getExchangeClass(config.id);
    if (!exchangeClass) {
      throw new Error(`Exchange ${config.id} not supported`);
    }

    const exchangeConfig: any = {
      apiKey: config.credentials.apiKey,
      secret: config.credentials.apiSecret,
      sandbox: false, // Set to true for testing
      enableRateLimit: true,
      options: {
        defaultType: this.getDefaultType(config.id)
      }
    };

    // Add passphrase if provided (for OKX)
    if (config.credentials.passphrase) {
      exchangeConfig.password = config.credentials.passphrase;
    }

    const exchange = new exchangeClass(exchangeConfig);

    // Test connection
    await exchange.loadMarkets();
    
    this.exchanges.set(config.id, exchange);
  }

  private getExchangeClass(exchangeId: string): typeof ccxt.Exchange | null {
    const exchangeMap: Record<string, typeof ccxt.Exchange> = {
      'binance': ccxt.binance,
      'binance_perpetual': ccxt.binance,
      'whitebit': ccxt.whitebit,
      'okx': ccxt.okx
    };
    
    return exchangeMap[exchangeId] || null;
  }

  private getDefaultType(exchangeId: string): string {
    if (exchangeId.includes('perpetual')) {
      return 'future'; // For perpetual contracts
    }
    return 'spot'; // Default to spot trading
  }

  private startConnectionMonitoring(): void {
    setInterval(async () => {
      for (const [exchangeId, exchange] of this.exchanges) {
        try {
          // Simple health check - fetch server time
          await exchange.fetchTime();
          
          if (!this.connectionStatus.get(exchangeId)) {
            this.connectionStatus.set(exchangeId, true);
            this.emit('connectionRestored', exchangeId);
            this.logger.info(`📡 Connection restored to ${exchangeId}`);
          }
        } catch (error) {
          if (this.connectionStatus.get(exchangeId)) {
            this.connectionStatus.set(exchangeId, false);
            this.emit('connectionLost', exchangeId);
            this.logger.error(`📡 Connection lost to ${exchangeId}`);
          }
        }
      }
    }, 30000); // Check every 30 seconds
  }

  public async cleanup(): Promise<void> {
    this.logger.info('Cleaning up exchange connections...');
    
    for (const [exchangeId, exchange] of this.exchanges) {
      try {
        if (exchange.close) {
          await exchange.close();
        }
      } catch (error) {
        this.logger.warn(`Error closing ${exchangeId}:`, error instanceof Error ? error : undefined, { error: String(error) });
      }
    }
    
    this.exchanges.clear();
    this.connectionStatus.clear();
  }

  public getActiveConnections(): number {
    return Array.from(this.connectionStatus.values())
      .filter(status => status).length;
  }

  public getExchange(exchangeId: string): ccxt.Exchange | null {
    return this.exchanges.get(exchangeId) || null;
  }

  public isConnected(exchangeId: string): boolean {
    return this.connectionStatus.get(exchangeId) || false;
  }

  public async fetchTicker(symbol: string, exchangeId: string): Promise<ccxt.Ticker | null> {
    const exchange = this.getExchange(exchangeId);
    if (!exchange || !this.isConnected(exchangeId)) {
      return null;
    }

    try {
      return await exchange.fetchTicker(symbol);
    } catch (error) {
      this.logger.error(`Error fetching ticker ${symbol} from ${exchangeId}:`, error);
      return null;
    }
  }

  public async fetchOrderBook(symbol: string, exchangeId: string, limit: number = 20): Promise<ccxt.OrderBook | null> {
    const exchange = this.getExchange(exchangeId);
    if (!exchange || !this.isConnected(exchangeId)) {
      return null;
    }

    try {
      return await exchange.fetchOrderBook(symbol, limit);
    } catch (error) {
      this.logger.error(`Error fetching orderbook ${symbol} from ${exchangeId}:`, error);
      return null;
    }
  }

  public async fetchBalance(exchangeId: string): Promise<ccxt.Balances | null> {
    const exchange = this.getExchange(exchangeId);
    if (!exchange || !this.isConnected(exchangeId)) {
      return null;
    }

    try {
      return await exchange.fetchBalance();
    } catch (error) {
      this.logger.error(`Error fetching balance from ${exchangeId}:`, error);
      return null;
    }
  }

  public async createOrder(
    exchangeId: string,
    symbol: string,
    type: 'market' | 'limit',
    side: 'buy' | 'sell',
    amount: number,
    price?: number
  ): Promise<ccxt.Order | null> {
    const exchange = this.getExchange(exchangeId);
    if (!exchange || !this.isConnected(exchangeId)) {
      throw new Error(`Exchange ${exchangeId} is not connected`);
    }

    try {
      return await exchange.createOrder(symbol, type, side, amount, price);
    } catch (error) {
      this.logger.error(`Error creating order on ${exchangeId}:`, error);
      throw error;
    }
  }

  public async cancelOrder(exchangeId: string, orderId: string, symbol: string): Promise<ccxt.Order | null> {
    const exchange = this.getExchange(exchangeId);
    if (!exchange || !this.isConnected(exchangeId)) {
      return null;
    }

    try {
      return await exchange.cancelOrder(orderId, symbol);
    } catch (error) {
      this.logger.error(`Error canceling order ${orderId} on ${exchangeId}:`, error);
      return null;
    }
  }
}
