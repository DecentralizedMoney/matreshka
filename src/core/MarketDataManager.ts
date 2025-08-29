import { EventEmitter } from 'events';
import { ExchangeManager } from './ExchangeManager';
import { Ticker, OrderBook } from '../types';
import { Logger } from '../utils/Logger';

export class MarketDataManager extends EventEmitter {
  private exchangeManager: ExchangeManager;
  private logger: Logger;
  private tickers: Map<string, Ticker> = new Map();
  private orderbooks: Map<string, OrderBook> = new Map();

  constructor(exchangeManager: ExchangeManager) {
    super();
    this.exchangeManager = exchangeManager;
    this.logger = new Logger('MarketDataManager');
  }

  public async start(): Promise<void> {
    this.logger.info('Starting market data manager...');
    // Mock some data
    this.mockData();
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping market data manager...');
    this.tickers.clear();
    this.orderbooks.clear();
  }

  public async getTicker(symbol: string, exchange: string): Promise<Ticker | null> {
    const key = `${exchange}:${symbol}`;
    return this.tickers.get(key) || null;
  }

  public async getOrderBook(symbol: string, exchange: string): Promise<OrderBook | null> {
    const key = `${exchange}:${symbol}`;
    return this.orderbooks.get(key) || null;
  }

  private mockData(): void {
    // Mock ticker data
    const exchanges = ['binance', 'whitebit', 'okx'];
    const symbols = ['BTC/USDT', 'ETH/USDT'];
    
    for (const exchange of exchanges) {
      for (const symbol of symbols) {
        const basePrice = symbol.includes('BTC') ? 45000 : 2800;
        const ticker: Ticker = {
          symbol,
          exchange,
          bid: basePrice * (1 - Math.random() * 0.001),
          ask: basePrice * (1 + Math.random() * 0.001),
          last: basePrice,
          volume: Math.random() * 1000000,
          change24h: (Math.random() - 0.5) * 10,
          timestamp: Date.now()
        };
        
        this.tickers.set(`${exchange}:${symbol}`, ticker);
        
        const orderbook: OrderBook = {
          symbol,
          exchange,
          bids: Array.from({ length: 10 }, (_, i) => [
            basePrice * (1 - (i + 1) * 0.0001),
            Math.random() * 10
          ]),
          asks: Array.from({ length: 10 }, (_, i) => [
            basePrice * (1 + (i + 1) * 0.0001),
            Math.random() * 10
          ]),
          timestamp: Date.now()
        };
        
        this.orderbooks.set(`${exchange}:${symbol}`, orderbook);
      }
    }
  }
}
