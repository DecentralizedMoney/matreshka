import { EventEmitter } from 'events';
import { Ticker, OrderBook } from '../types';
import { Logger } from '../utils/Logger';

export class DemoDataProvider extends EventEmitter {
  private logger: Logger;
  private isRunning: boolean = false;
  private dataInterval?: NodeJS.Timeout;
  private tickerData: Map<string, Ticker> = new Map();
  private orderBookData: Map<string, OrderBook> = new Map();

  // Demo configuration
  private readonly EXCHANGES = ['binance', 'whitebit', 'okx', 'binance_perpetual'];
  private readonly SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'XRP/USDT', 'ADA/USDT', 'SOL/USDT'];
  private readonly UPDATE_INTERVAL = 1000; // 1 second

  // Base prices for simulation
  private basePrices: Map<string, number> = new Map([
    ['BTC/USDT', 43000],
    ['ETH/USDT', 2300],
    ['XRP/USDT', 0.52],
    ['ADA/USDT', 0.38],
    ['SOL/USDT', 95]
  ]);

  // Price volatility factors
  private volatilityFactors: Map<string, number> = new Map([
    ['BTC/USDT', 0.02], // 2% volatility
    ['ETH/USDT', 0.025], // 2.5% volatility
    ['XRP/USDT', 0.05], // 5% volatility
    ['ADA/USDT', 0.06], // 6% volatility
    ['SOL/USDT', 0.04] // 4% volatility
  ]);

  constructor() {
    super();
    this.logger = new Logger('DemoDataProvider');
    this.initializeDemoData();
  }

  private initializeDemoData(): void {
    for (const exchange of this.EXCHANGES) {
      for (const symbol of this.SYMBOLS) {
        this.generateTicker(symbol, exchange);
        this.generateOrderBook(symbol, exchange);
      }
    }
  }

  public start(): void {
    if (this.isRunning) return;

    this.logger.info('🎭 Starting demo data provider...');
    this.isRunning = true;

    this.dataInterval = setInterval(() => {
      this.updateDemoData();
    }, this.UPDATE_INTERVAL);

    this.logger.info('✅ Demo data provider started');
  }

  public stop(): void {
    if (!this.isRunning) return;

    this.logger.info('Stopping demo data provider...');
    this.isRunning = false;

    if (this.dataInterval) {
      clearInterval(this.dataInterval);
    }

    this.logger.info('✅ Demo data provider stopped');
  }

  private updateDemoData(): void {
    for (const exchange of this.EXCHANGES) {
      for (const symbol of this.SYMBOLS) {
        this.updateTicker(symbol, exchange);
        this.updateOrderBook(symbol, exchange);
      }
    }

    // Randomly generate arbitrage opportunities
    if (Math.random() < 0.1) { // 10% chance per update
      this.generateArbitrageOpportunity();
    }
  }

  private generateTicker(symbol: string, exchange: string): void {
    const basePrice = this.basePrices.get(symbol) || 1000;
    const volatility = this.volatilityFactors.get(symbol) || 0.02;
    
    // Add exchange-specific spreads to create arbitrage opportunities
    let exchangeSpread = 0;
    switch (exchange) {
      case 'binance':
        exchangeSpread = 0.998; // Slightly lower prices
        break;
      case 'whitebit':
        exchangeSpread = 1.002; // Slightly higher prices
        break;
      case 'okx':
        exchangeSpread = 1.001; // Neutral
        break;
      case 'binance_perpetual':
        exchangeSpread = 1.0005; // Small premium for perpetuals
        break;
    }

    // Random price movement
    const randomFactor = 1 + (Math.random() - 0.5) * volatility;
    const currentPrice = basePrice * randomFactor * exchangeSpread;

    // Create realistic bid/ask spread
    const spread = currentPrice * 0.001; // 0.1% spread
    const bid = currentPrice - spread / 2;
    const ask = currentPrice + spread / 2;

    const ticker: Ticker = {
      symbol,
      exchange,
      bid,
      ask,
      last: currentPrice,
      volume: Math.random() * 1000000 + 100000, // 100k - 1.1M volume
      change24h: (Math.random() - 0.5) * 10, // -5% to +5% daily change
      timestamp: Date.now()
    };

    const key = `${exchange}:${symbol}`;
    this.tickerData.set(key, ticker);
  }

  private generateOrderBook(symbol: string, exchange: string): void {
    const ticker = this.tickerData.get(`${exchange}:${symbol}`);
    if (!ticker) return;

    const { bid, ask } = ticker;
    const bids: [number, number][] = [];
    const asks: [number, number][] = [];

    // Generate 20 levels of bids and asks
    for (let i = 0; i < 20; i++) {
      // Bids (decreasing prices)
      const bidPrice = bid - (i * bid * 0.0001); // 0.01% steps down
      const bidAmount = Math.random() * 10 + 0.1; // 0.1 to 10.1 amount
      bids.push([bidPrice, bidAmount]);

      // Asks (increasing prices)
      const askPrice = ask + (i * ask * 0.0001); // 0.01% steps up
      const askAmount = Math.random() * 10 + 0.1;
      asks.push([askPrice, askAmount]);
    }

    const orderbook: OrderBook = {
      symbol,
      exchange,
      bids,
      asks,
      timestamp: Date.now()
    };

    const key = `${exchange}:${symbol}`;
    this.orderBookData.set(key, orderbook);
  }

  private updateTicker(symbol: string, exchange: string): void {
    const key = `${exchange}:${symbol}`;
    const currentTicker = this.tickerData.get(key);
    if (!currentTicker) {
      this.generateTicker(symbol, exchange);
      return;
    }

    // Small price movements
    const volatility = this.volatilityFactors.get(symbol) || 0.02;
    const priceChange = (Math.random() - 0.5) * volatility * 0.1; // Small movements
    
    const newPrice = currentTicker.last * (1 + priceChange);
    const spread = newPrice * 0.001;

    const updatedTicker: Ticker = {
      ...currentTicker,
      bid: newPrice - spread / 2,
      ask: newPrice + spread / 2,
      last: newPrice,
      timestamp: Date.now()
    };

    this.tickerData.set(key, updatedTicker);
  }

  private updateOrderBook(symbol: string, exchange: string): void {
    // Regenerate orderbook with new prices
    this.generateOrderBook(symbol, exchange);
  }

  private generateArbitrageOpportunity(): void {
    // Randomly select a symbol and create a price discrepancy
    const symbol = this.SYMBOLS[Math.floor(Math.random() * this.SYMBOLS.length)];
    if (!symbol) return;

    const exchanges = this.EXCHANGES.filter(e => !e.includes('perpetual'));
    if (exchanges.length < 2) return;

    const exchangeA = exchanges[0];
    const exchangeB = exchanges[1];
    if (!exchangeA || !exchangeB) return;

    // Create artificial price difference
    const keyA = `${exchangeA}:${symbol}`;
    const keyB = `${exchangeB}:${symbol}`;
    
    const tickerA = this.tickerData.get(keyA);
    const tickerB = this.tickerData.get(keyB);
    
    if (!tickerA || !tickerB) return;

    // Increase price difference temporarily
    const priceDiff = 0.005; // 0.5% difference
    
    tickerA.ask = tickerA.last * (1 - priceDiff);
    tickerA.bid = tickerA.ask - tickerA.ask * 0.001;
    
    tickerB.bid = tickerB.last * (1 + priceDiff);
    tickerB.ask = tickerB.bid + tickerB.bid * 0.001;
    
    this.tickerData.set(keyA, tickerA);
    this.tickerData.set(keyB, tickerB);

    this.logger.info(`🎯 Generated arbitrage opportunity: ${symbol} between ${exchangeA} and ${exchangeB}`);
  }

  public getTicker(symbol: string, exchange: string): Ticker | null {
    const key = `${exchange}:${symbol}`;
    return this.tickerData.get(key) || null;
  }

  public getOrderBook(symbol: string, exchange: string): OrderBook | null {
    const key = `${exchange}:${symbol}`;
    return this.orderBookData.get(key) || null;
  }

  public isConnected(exchange: string): boolean {
    return this.EXCHANGES.includes(exchange);
  }

  public getAvailableSymbols(): string[] {
    return this.SYMBOLS;
  }

  public getAvailableExchanges(): string[] {
    return this.EXCHANGES;
  }

  // Simulate funding rates for perpetual contracts
  public getFundingRate(symbol: string, exchange: string): number {
    if (!exchange.includes('perpetual')) return 0;
    
    // Random funding rate between -0.1% and 0.1%
    return (Math.random() - 0.5) * 0.002;
  }

  // Create market stress scenarios for testing
  public createStressScenario(type: 'volatility' | 'liquidity' | 'correlation'): void {
    this.logger.info(`🔥 Creating stress scenario: ${type}`);
    
    switch (type) {
      case 'volatility':
        // Increase volatility across all assets
        for (const [symbol] of this.volatilityFactors) {
          const currentVol = this.volatilityFactors.get(symbol) || 0.02;
          this.volatilityFactors.set(symbol, currentVol * 3); // 3x volatility
        }
        break;
        
      case 'liquidity':
        // Reduce liquidity in order books
        for (const [key, orderbook] of this.orderBookData) {
          orderbook.bids = orderbook.bids.map(([price, amount]) => [price, amount * 0.3]);
          orderbook.asks = orderbook.asks.map(([price, amount]) => [price, amount * 0.3]);
          this.orderBookData.set(key, orderbook);
        }
        break;
        
      case 'correlation':
        // Make all assets move together (high correlation)
        const btcTicker = this.tickerData.get('binance:BTC/USDT');
        if (btcTicker) {
          const btcChange = (btcTicker.last - (this.basePrices.get('BTC/USDT') || 43000)) / (this.basePrices.get('BTC/USDT') || 43000);
          
          for (const symbol of this.SYMBOLS) {
            if (symbol === 'BTC/USDT') continue;
            
            const basePrice = this.basePrices.get(symbol) || 1000;
            const newPrice = basePrice * (1 + btcChange * 0.8); // 80% correlation
            
            for (const exchange of this.EXCHANGES) {
              const key = `${exchange}:${symbol}`;
              const ticker = this.tickerData.get(key);
              if (ticker) {
                ticker.last = newPrice;
                ticker.bid = newPrice * 0.999;
                ticker.ask = newPrice * 1.001;
                this.tickerData.set(key, ticker);
              }
            }
          }
        }
        break;
    }
    
    // Reset after 30 seconds
    setTimeout(() => {
      this.logger.info(`📈 Stress scenario ${type} ended, returning to normal`);
      this.initializeDemoData();
    }, 30000);
  }
}
