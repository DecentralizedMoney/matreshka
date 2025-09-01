import { EventEmitter } from 'events';
import { ExchangeManager } from './ExchangeManager';
import { DemoDataProvider } from './DemoDataProvider';
import { Ticker, OrderBook } from '../types';
import { Logger } from '../utils/Logger';
import * as ccxt from 'ccxt';

export class MarketDataManager extends EventEmitter {
  private exchangeManager: ExchangeManager;
  private demoDataProvider: DemoDataProvider | undefined;
  private logger: Logger;
  private tickers: Map<string, Ticker> = new Map();
  private orderbooks: Map<string, OrderBook> = new Map();
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isStarted: boolean = false;
  private isDemoMode: boolean = false;

  // Configuration
  private readonly TICKER_UPDATE_INTERVAL = 5000; // 5 seconds
  private readonly ORDERBOOK_UPDATE_INTERVAL = 2000; // 2 seconds
  private readonly SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'XRP/USDT'];

  constructor(exchangeManager: ExchangeManager, demoDataProvider?: DemoDataProvider) {
    super();
    this.exchangeManager = exchangeManager;
    this.demoDataProvider = demoDataProvider;
    this.logger = new Logger('MarketDataManager');
    this.isDemoMode = process.env['DEMO_MODE'] === 'true' || !process.env['BINANCE_API_KEY'];
  }

  public async start(): Promise<void> {
    if (this.isStarted) {
      this.logger.warn('Market data manager is already started');
      return;
    }

    this.logger.info('Starting market data manager...');
    this.isStarted = true;

    if (this.isDemoMode && this.demoDataProvider) {
      this.logger.info('🎭 Using demo data provider for market data');
      // Demo mode doesn't need real updates, demo provider handles it
    } else {
      // Start real-time data updates
      this.startTickerUpdates();
      this.startOrderBookUpdates();
      
      // Initial data fetch
      await this.fetchInitialData();
    }
    
    this.logger.info('✅ Market data manager started successfully');
  }

  private async fetchInitialData(): Promise<void> {
    this.logger.info('Fetching initial market data...');
    
    const exchanges = ['binance', 'whitebit', 'okx'];
    
    for (const exchangeId of exchanges) {
      if (!this.exchangeManager.isConnected(exchangeId)) {
        continue;
      }
      
      for (const symbol of this.SYMBOLS) {
        try {
          await this.updateTicker(symbol, exchangeId);
          await this.updateOrderBook(symbol, exchangeId);
        } catch (error) {
          this.logger.debug(`Failed to fetch initial data for ${symbol} on ${exchangeId}:`, error instanceof Error ? error : undefined, { error: String(error) });
        }
      }
    }
  }

  private startTickerUpdates(): void {
    const interval = setInterval(async () => {
      if (!this.isStarted) {
        clearInterval(interval);
        return;
      }
      
      await this.updateAllTickers();
    }, this.TICKER_UPDATE_INTERVAL);
    
    this.updateIntervals.set('tickers', interval);
  }

  private startOrderBookUpdates(): void {
    const interval = setInterval(async () => {
      if (!this.isStarted) {
        clearInterval(interval);
        return;
      }
      
      await this.updateAllOrderBooks();
    }, this.ORDERBOOK_UPDATE_INTERVAL);
    
    this.updateIntervals.set('orderbooks', interval);
  }

  private async updateAllTickers(): Promise<void> {
    const exchanges = ['binance', 'whitebit', 'okx'];
    
    for (const exchangeId of exchanges) {
      if (!this.exchangeManager.isConnected(exchangeId)) {
        continue;
      }
      
      for (const symbol of this.SYMBOLS) {
        try {
          await this.updateTicker(symbol, exchangeId);
        } catch (error) {
          this.logger.debug(`Failed to update ticker ${symbol} on ${exchangeId}:`, error instanceof Error ? error : undefined, { error: String(error) });
        }
      }
    }
  }

  private async updateAllOrderBooks(): Promise<void> {
    const exchanges = ['binance', 'whitebit', 'okx'];
    
    for (const exchangeId of exchanges) {
      if (!this.exchangeManager.isConnected(exchangeId)) {
        continue;
      }
      
      for (const symbol of this.SYMBOLS) {
        try {
          await this.updateOrderBook(symbol, exchangeId);
        } catch (error) {
          this.logger.debug(`Failed to update orderbook ${symbol} on ${exchangeId}:`, error instanceof Error ? error : undefined, { error: String(error) });
        }
      }
    }
  }

  private async updateTicker(symbol: string, exchangeId: string): Promise<void> {
    const ccxtTicker = await this.exchangeManager.fetchTicker(symbol, exchangeId);
    if (!ccxtTicker) {
      return;
    }

    const ticker: Ticker = {
      symbol,
      exchange: exchangeId,
      bid: ccxtTicker.bid || 0,
      ask: ccxtTicker.ask || 0,
      last: ccxtTicker.last || 0,
      volume: ccxtTicker.baseVolume || 0,
      change24h: ccxtTicker.percentage || 0,
      timestamp: ccxtTicker.timestamp || Date.now()
    };

    const key = `${exchangeId}:${symbol}`;
    const oldTicker = this.tickers.get(key);
    this.tickers.set(key, ticker);

    // Emit price alerts for significant changes
    if (oldTicker && ticker.last > 0 && oldTicker.last > 0) {
      const priceChange = ((ticker.last - oldTicker.last) / oldTicker.last) * 100;
      if (Math.abs(priceChange) > 1) { // 1% change
        this.emit('priceAlert', symbol, exchangeId, ticker.last, priceChange);
      }
    }

    // Emit volume spikes
    if (oldTicker && ticker.volume > oldTicker.volume * 2) {
      const volumeSpike = ticker.volume / oldTicker.volume;
      this.emit('volumeSpike', symbol, exchangeId, ticker.volume, volumeSpike);
    }
  }

  private async updateOrderBook(symbol: string, exchangeId: string): Promise<void> {
    const ccxtOrderBook = await this.exchangeManager.fetchOrderBook(symbol, exchangeId);
    if (!ccxtOrderBook) {
      return;
    }

    const orderbook: OrderBook = {
      symbol,
      exchange: exchangeId,
      bids: ccxtOrderBook.bids.map((item: any) => [Number(item[0]), Number(item[1])]),
      asks: ccxtOrderBook.asks.map((item: any) => [Number(item[0]), Number(item[1])]),
      timestamp: ccxtOrderBook.timestamp || Date.now()
    };

    const key = `${exchangeId}:${symbol}`;
    this.orderbooks.set(key, orderbook);
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping market data manager...');
    
    this.isStarted = false;
    
    // Clear all intervals
    for (const [name, interval] of this.updateIntervals) {
      clearInterval(interval);
      this.logger.debug(`Stopped ${name} updates`);
    }
    
    this.updateIntervals.clear();
    this.tickers.clear();
    this.orderbooks.clear();
    
    this.logger.info('✅ Market data manager stopped');
  }

  public async getTicker(symbol: string, exchange: string): Promise<Ticker | null> {
    if (this.isDemoMode && this.demoDataProvider) {
      return this.demoDataProvider.getTicker(symbol, exchange);
    }
    
    const key = `${exchange}:${symbol}`;
    return this.tickers.get(key) || null;
  }

  public async getOrderBook(symbol: string, exchange: string): Promise<OrderBook | null> {
    if (this.isDemoMode && this.demoDataProvider) {
      return this.demoDataProvider.getOrderBook(symbol, exchange);
    }
    
    const key = `${exchange}:${symbol}`;
    return this.orderbooks.get(key) || null;
  }

  public getAvailableSymbols(): string[] {
    if (this.isDemoMode && this.demoDataProvider) {
      return this.demoDataProvider.getAvailableSymbols();
    }
    return this.SYMBOLS;
  }

  public getConnectedExchanges(): string[] {
    if (this.isDemoMode && this.demoDataProvider) {
      return this.demoDataProvider.getAvailableExchanges();
    }
    const exchanges = ['binance', 'whitebit', 'okx'];
    return exchanges.filter(exchangeId => this.exchangeManager.isConnected(exchangeId));
  }

  public getMarketSummary(): any {
    const summary: any = {
      totalTickers: this.tickers.size,
      totalOrderBooks: this.orderbooks.size,
      exchanges: {},
      lastUpdate: new Date()
    };

    for (const [key, ticker] of this.tickers) {
      const [exchange] = key.split(':');
      if (exchange && !summary.exchanges[exchange]) {
        summary.exchanges[exchange] = {
          tickers: 0,
          symbols: new Set()
        };
      }
      if (exchange && summary.exchanges[exchange]) {
        summary.exchanges[exchange].tickers++;
        summary.exchanges[exchange].symbols.add(ticker.symbol);
      }
    }

    // Convert Sets to arrays for serialization
    for (const exchange in summary.exchanges) {
      if (summary.exchanges[exchange]) {
        summary.exchanges[exchange].symbols = Array.from(summary.exchanges[exchange].symbols);
      }
    }

    return summary;
  }
}
