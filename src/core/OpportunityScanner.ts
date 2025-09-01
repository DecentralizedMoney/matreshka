import { EventEmitter } from 'events';
import { ArbitrageOpportunity, StrategyConfig, TradePath, RiskFactor, OrderBook, Ticker } from '../types';
import { MarketDataManager } from './MarketDataManager';
import { RiskManager } from './RiskManager';
import { Logger } from '../utils/Logger';
import * as math from 'mathjs';

export class OpportunityScanner extends EventEmitter {
  private strategies: StrategyConfig[];
  private marketDataManager: MarketDataManager;
  private riskManager: RiskManager;
  private logger: Logger;

  private isScanning: boolean = false;
  private isPaused: boolean = false;
  private scanInterval?: NodeJS.Timeout;
  private activeOpportunities: Map<string, ArbitrageOpportunity> = new Map();

  // Configuration
  private readonly SCAN_INTERVAL_MS = 1000; // 1 second
  private readonly MAX_OPPORTUNITIES = 50;
  private readonly OPPORTUNITY_TTL_MS = 30000; // 30 seconds

  constructor(
    strategies: StrategyConfig[],
    marketDataManager: MarketDataManager,
    riskManager: RiskManager
  ) {
    super();
    this.strategies = strategies.filter(s => s.enabled);
    this.marketDataManager = marketDataManager;
    this.riskManager = riskManager;
    this.logger = new Logger('OpportunityScanner');
  }

  public start(): void {
    if (this.isScanning) {
      this.logger.warn('Scanner is already running');
      return;
    }

    this.logger.info('Starting opportunity scanner...');
    this.isScanning = true;
    this.isPaused = false;

    this.scanInterval = setInterval(() => {
      if (!this.isPaused) {
        this.scan();
      }
    }, this.SCAN_INTERVAL_MS);

    // Clean up expired opportunities
    setInterval(() => {
      this.cleanupExpiredOpportunities();
    }, 5000);

    this.logger.info(`Opportunity scanner started with ${this.strategies.length} strategies`);
  }

  public stop(): void {
    if (!this.isScanning) {
      return;
    }

    this.logger.info('Stopping opportunity scanner...');
    this.isScanning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }

    this.activeOpportunities.clear();
    this.logger.info('Opportunity scanner stopped');
  }

  public pause(): void {
    this.isPaused = true;
    this.logger.info('Opportunity scanner paused');
  }

  public resume(): void {
    this.isPaused = false;
    this.logger.info('Opportunity scanner resumed');
  }

  private async scan(): Promise<void> {
    try {
      for (const strategy of this.strategies) {
        if (!strategy.enabled) continue;

        switch (strategy.type) {
          case 'simple_arbitrage':
            await this.scanSimpleArbitrage(strategy);
            break;
          case 'triangular':
            await this.scanTriangularArbitrage(strategy);
            break;
          case 'funding_rate':
            await this.scanFundingRateArbitrage(strategy);
            break;
          case 'volatility':
            await this.scanVolatilityArbitrage(strategy);
            break;
        }
      }
    } catch (error) {
      this.logger.error('Error during opportunity scan:', error);
    }
  }

  private async scanSimpleArbitrage(strategy: StrategyConfig): Promise<void> {
    // Simple arbitrage: same asset pair across different exchanges
    for (const symbol of strategy.symbols) {
      const exchangeData: { exchange: string; ticker: Ticker; orderbook: OrderBook }[] = [];

      // Collect data from all configured exchanges
      for (const exchangeId of strategy.exchanges) {
        try {
          const ticker = await this.marketDataManager.getTicker(symbol, exchangeId);
          const orderbook = await this.marketDataManager.getOrderBook(symbol, exchangeId);

          if (ticker && orderbook) {
            exchangeData.push({ exchange: exchangeId, ticker, orderbook });
          }
        } catch (error) {
          this.logger.debug(`Failed to get data for ${symbol} on ${exchangeId}:`, { errorMessage: String(error) });
        }
      }

      // Find arbitrage opportunities
      if (exchangeData.length >= 2) {
        this.findSimpleArbitrageOpportunities(symbol, exchangeData, strategy);
      }
    }
  }

  private findSimpleArbitrageOpportunities(
    symbol: string,
    exchangeData: { exchange: string; ticker: Ticker; orderbook: OrderBook }[],
    strategy: StrategyConfig
  ): void {
    // Sort by best prices
    const sortedByBid = [...exchangeData].sort((a, b) => b.ticker.bid - a.ticker.bid);
    const sortedByAsk = [...exchangeData].sort((a, b) => a.ticker.ask - b.ticker.ask);

    const buyExchange = sortedByAsk[0]; // Lowest ask (buy here)
    const sellExchange = sortedByBid[0]; // Highest bid (sell here)

    if (!buyExchange || !sellExchange || buyExchange.exchange === sellExchange.exchange) {
      return; // Same exchange, no arbitrage
    }

    const buyPrice = buyExchange.ticker.ask;
    const sellPrice = sellExchange.ticker.bid;
    const profitPercent = ((sellPrice - buyPrice) / buyPrice) * 100;

    if (profitPercent < strategy.minProfitPercent) {
      return; // Not profitable enough
    }

    // Calculate optimal trade size based on orderbook depth
    const maxBuyAmount = this.calculateMaxTradeAmount(buyExchange.orderbook, 'buy');
    const maxSellAmount = this.calculateMaxTradeAmount(sellExchange.orderbook, 'sell');
    const maxAmount = Math.min(maxBuyAmount, maxSellAmount, strategy.maxPositionSize);

    if (maxAmount <= 0) {
      return; // No liquidity
    }

    // Calculate fees and net profit
    const buyFee = this.calculateTradingFee(buyExchange.exchange, maxAmount * buyPrice);
    const sellFee = this.calculateTradingFee(sellExchange.exchange, maxAmount * sellPrice);
    const grossProfit = maxAmount * (sellPrice - buyPrice);
    const netProfit = grossProfit - buyFee - sellFee;
    const netProfitPercent = (netProfit / (maxAmount * buyPrice)) * 100;

    if (netProfitPercent < strategy.minProfitPercent) {
      return; // Not profitable after fees
    }

    // Create opportunity
    const opportunity: ArbitrageOpportunity = {
      id: this.generateOpportunityId(),
      type: 'simple',
      profit: netProfit,
      profitPercent: netProfitPercent,
      volume: maxAmount,
      paths: [
        {
          step: 1,
          exchange: buyExchange.exchange,
          symbol,
          side: 'buy',
          amount: maxAmount,
          price: buyPrice,
          fee: buyFee,
          estimatedTime: 2000 // 2 seconds
        },
        {
          step: 2,
          exchange: sellExchange.exchange,
          symbol,
          side: 'sell',
          amount: maxAmount,
          price: sellPrice,
          fee: sellFee,
          estimatedTime: 2000
        }
      ],
      estimatedDuration: 10, // 10 seconds
      confidence: this.calculateConfidence(exchangeData),
      risks: this.assessRisks(exchangeData, strategy),
      created: new Date(),
      expires: new Date(Date.now() + this.OPPORTUNITY_TTL_MS)
    };

    this.addOpportunity(opportunity);
  }

  private async scanTriangularArbitrage(strategy: StrategyConfig): Promise<void> {
    // Triangular arbitrage: A -> B -> C -> A
    // Example: USD -> BTC -> ETH -> USD
    
    // This is a simplified implementation
    // In practice, you'd need to consider all possible triangle combinations
    const triangles = this.getTriangleCombinations(strategy.symbols);

    for (const triangle of triangles) {
      for (const exchangeId of strategy.exchanges) {
        try {
          const opportunity = await this.findTriangularOpportunity(triangle, exchangeId, strategy);
          if (opportunity) {
            this.addOpportunity(opportunity);
          }
        } catch (error) {
          this.logger.debug(`Triangular arbitrage scan failed for ${exchangeId}:`, { errorMessage: String(error) });
        }
      }
    }
  }

  private async findTriangularOpportunity(
    triangle: string[],
    exchangeId: string,
    strategy: StrategyConfig
  ): Promise<ArbitrageOpportunity | null> {
    // Get prices for all three pairs in the triangle
    const [base, intermediate, quote] = triangle;
    const pair1 = `${base}/${intermediate}`; // A/B
    const pair2 = `${intermediate}/${quote}`; // B/C
    const pair3 = `${base}/${quote}`; // A/C

    const [ticker1, ticker2, ticker3] = await Promise.all([
      this.marketDataManager.getTicker(pair1, exchangeId),
      this.marketDataManager.getTicker(pair2, exchangeId),
      this.marketDataManager.getTicker(pair3, exchangeId)
    ]);

    if (!ticker1 || !ticker2 || !ticker3) {
      return null;
    }

    // Calculate forward path: base -> intermediate -> quote
    const forwardRate = ticker1.bid * ticker2.bid;
    const directRate = ticker3.ask;
    const forwardProfit = (forwardRate - directRate) / directRate;

    // Calculate reverse path: quote -> intermediate -> base
    const reverseRate = (1 / ticker2.ask) * (1 / ticker1.ask);
    const reverseDirectRate = 1 / ticker3.bid;
    const reverseProfit = (reverseRate - reverseDirectRate) / reverseDirectRate;

    const bestProfit = Math.max(forwardProfit, reverseProfit);
    const profitPercent = bestProfit * 100;

    if (profitPercent < strategy.minProfitPercent) {
      return null;
    }

    // Use forward path if more profitable
    const useForward = forwardProfit > reverseProfit;
    const tradeAmount = Math.min(strategy.maxPositionSize, 1000); // Simplified

    const paths: TradePath[] = useForward ? [
      {
        step: 1,
        exchange: exchangeId,
        symbol: pair1,
        side: 'sell',
        amount: tradeAmount,
        price: ticker1.bid,
        fee: this.calculateTradingFee(exchangeId, tradeAmount * ticker1.bid),
        estimatedTime: 2000
      },
      {
        step: 2,
        exchange: exchangeId,
        symbol: pair2,
        side: 'sell',
        amount: tradeAmount * ticker1.bid,
        price: ticker2.bid,
        fee: this.calculateTradingFee(exchangeId, tradeAmount * ticker1.bid * ticker2.bid),
        estimatedTime: 2000
      },
      {
        step: 3,
        exchange: exchangeId,
        symbol: pair3,
        side: 'buy',
        amount: tradeAmount,
        price: ticker3.ask,
        fee: this.calculateTradingFee(exchangeId, tradeAmount * ticker3.ask),
        estimatedTime: 2000
      }
    ] : [
      // Reverse path implementation
      {
        step: 1,
        exchange: exchangeId,
        symbol: pair3,
        side: 'sell',
        amount: tradeAmount,
        price: ticker3.bid,
        fee: this.calculateTradingFee(exchangeId, tradeAmount * ticker3.bid),
        estimatedTime: 2000
      },
      {
        step: 2,
        exchange: exchangeId,
        symbol: pair2,
        side: 'buy',
        amount: tradeAmount * ticker3.bid / ticker2.ask,
        price: ticker2.ask,
        fee: this.calculateTradingFee(exchangeId, tradeAmount * ticker3.bid),
        estimatedTime: 2000
      },
      {
        step: 3,
        exchange: exchangeId,
        symbol: pair1,
        side: 'buy',
        amount: tradeAmount,
        price: ticker1.ask,
        fee: this.calculateTradingFee(exchangeId, tradeAmount * ticker1.ask),
        estimatedTime: 2000
      }
    ];

    const totalFees = paths.reduce((sum, path) => sum + path.fee, 0);
    const grossProfit = tradeAmount * bestProfit;
    const netProfit = grossProfit - totalFees;

    return {
      id: this.generateOpportunityId(),
      type: 'triangular',
      profit: netProfit,
      profitPercent: (netProfit / tradeAmount) * 100,
      volume: tradeAmount,
      paths,
      estimatedDuration: 15, // 15 seconds for 3 trades
      confidence: 0.7, // Lower confidence for triangular arbitrage
      risks: [
        {
          type: 'timing',
          severity: 'medium',
          description: 'Price movement during execution',
          impact: 0.3
        }
      ],
      created: new Date(),
      expires: new Date(Date.now() + this.OPPORTUNITY_TTL_MS)
    };
  }

  private async scanFundingRateArbitrage(strategy: StrategyConfig): Promise<void> {
    // Funding rate arbitrage: Long spot + Short perpetual
    // This strategy profits from positive funding rates on perpetual contracts
    
    for (const symbol of strategy.symbols) {
      const spotExchanges = strategy.exchanges.filter(e => !e.includes('perpetual'));
      const perpExchanges = strategy.exchanges.filter(e => e.includes('perpetual'));

      for (const spotExchange of spotExchanges) {
        for (const perpExchange of perpExchanges) {
          try {
            const opportunity = await this.findFundingRateOpportunity(
              symbol,
              spotExchange,
              perpExchange,
              strategy
            );
            if (opportunity) {
              this.addOpportunity(opportunity);
            }
          } catch (error) {
            this.logger.debug('Funding rate arbitrage scan failed:', { errorMessage: String(error) });
          }
        }
      }
    }
  }

  private async findFundingRateOpportunity(
    symbol: string,
    spotExchange: string,
    perpExchange: string,
    strategy: StrategyConfig
  ): Promise<ArbitrageOpportunity | null> {
    const spotTicker = await this.marketDataManager.getTicker(symbol, spotExchange);
    const perpTicker = await this.marketDataManager.getTicker(symbol, perpExchange);

    if (!spotTicker || !perpTicker) {
      return null;
    }

    // Get funding rate (this would come from the exchange API)
    const fundingRate = await this.getFundingRate(symbol, perpExchange);
    if (!fundingRate || fundingRate <= 0) {
      return null; // Only profit from positive funding rates
    }

    // Calculate annual funding rate (funding usually happens every 8 hours)
    const annualFundingRate = fundingRate * 3 * 365; // 3 times per day

    if (annualFundingRate < strategy.minProfitPercent) {
      return null;
    }

    const tradeAmount = Math.min(strategy.maxPositionSize, 1000);
    const spotPrice = spotTicker.ask;
    const perpPrice = perpTicker.bid;

    // Calculate basis (difference between spot and perpetual)
    const basis = (perpPrice - spotPrice) / spotPrice;
    const basisPercent = basis * 100;

    // Opportunity is profitable if funding rate > basis
    const expectedProfit = (fundingRate - Math.abs(basis)) * tradeAmount * spotPrice;
    
    if (expectedProfit <= 0) {
      return null;
    }

    return {
      id: this.generateOpportunityId(),
      type: 'perpetual_spot',
      profit: expectedProfit,
      profitPercent: (expectedProfit / (tradeAmount * spotPrice)) * 100,
      volume: tradeAmount,
      paths: [
        {
          step: 1,
          exchange: spotExchange,
          symbol,
          side: 'buy',
          amount: tradeAmount,
          price: spotPrice,
          fee: this.calculateTradingFee(spotExchange, tradeAmount * spotPrice),
          estimatedTime: 2000
        },
        {
          step: 2,
          exchange: perpExchange,
          symbol,
          side: 'sell',
          amount: tradeAmount,
          price: perpPrice,
          fee: this.calculateTradingFee(perpExchange, tradeAmount * perpPrice),
          estimatedTime: 2000
        }
      ],
      estimatedDuration: 8 * 60 * 60, // Hold until next funding
      confidence: 0.8,
      risks: [
        {
          type: 'volatility',
          severity: 'medium',
          description: 'Price volatility during holding period',
          impact: 0.4
        }
      ],
      created: new Date(),
      expires: new Date(Date.now() + this.OPPORTUNITY_TTL_MS)
    };
  }

  private async scanVolatilityArbitrage(strategy: StrategyConfig): Promise<void> {
    // Volatility arbitrage: Profit from volatility differences
    // This is a placeholder for more complex volatility strategies
    this.logger.debug('Volatility arbitrage scanning not yet implemented');
  }

  // Utility methods
  private calculateMaxTradeAmount(orderbook: OrderBook, side: 'buy' | 'sell'): number {
    const orders = side === 'buy' ? orderbook.asks : orderbook.bids;
    let totalAmount = 0;
    let totalValue = 0;

    for (const [price, amount] of orders) {
      totalAmount += amount;
      totalValue += price * amount;
      
      // Stop if we have enough liquidity or reach price threshold
      if (totalValue > 10000 || totalAmount > 100) { // $10k or 100 units
        break;
      }
    }

    return totalAmount * 0.8; // Use 80% of available liquidity for safety
  }

  private calculateTradingFee(exchangeId: string, notionalValue: number): number {
    // This would normally come from exchange configuration
    const defaultFeeRate = 0.001; // 0.1%
    return notionalValue * defaultFeeRate;
  }

  private calculateConfidence(exchangeData: any[]): number {
    // Simplified confidence calculation based on data quality
    let confidence = 1.0;
    
    // Reduce confidence if few exchanges
    if (exchangeData.length < 3) {
      confidence *= 0.8;
    }
    
    // Reduce confidence for stale data
    const now = Date.now();
    for (const data of exchangeData) {
      const age = now - data.ticker.timestamp;
      if (age > 5000) { // 5 seconds
        confidence *= 0.9;
      }
    }
    
    return Math.max(0.1, confidence);
  }

  private assessRisks(exchangeData: any[], strategy: StrategyConfig): RiskFactor[] {
    const risks: RiskFactor[] = [];
    
    // Liquidity risk
    const minLiquidity = Math.min(...exchangeData.map(d => d.ticker.volume));
    if (minLiquidity < 100000) { // $100k daily volume
      risks.push({
        type: 'liquidity',
        severity: 'medium',
        description: 'Low liquidity on one or more exchanges',
        impact: 0.3
      });
    }
    
    // Exchange risk
    for (const data of exchangeData) {
      if (this.isHighRiskExchange(data.exchange)) {
        risks.push({
          type: 'exchange',
          severity: 'high',
          description: `High-risk exchange: ${data.exchange}`,
          impact: 0.5
        });
      }
    }
    
    return risks;
  }

  private isHighRiskExchange(exchangeId: string): boolean {
    // List of exchanges considered high-risk
    const highRiskExchanges = ['unknown', 'new_exchange'];
    return highRiskExchanges.includes(exchangeId);
  }

  private getTriangleCombinations(symbols: string[]): string[][] {
    // Generate possible triangle combinations from available symbols
    // This is a simplified implementation
    const combinations: string[][] = [];
    
    // Common base currencies
    const bases = ['BTC', 'ETH', 'USD', 'USDT'];
    
    for (const base of bases) {
      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          const symbolI = symbols[i];
          const symbolJ = symbols[j];
          if (!symbolI || !symbolJ) continue;
          
          const intermediate = symbolI.split('/')[0];
          const quote = symbolJ.split('/')[0];
          
          if (intermediate && quote && intermediate !== quote && intermediate !== base && quote !== base) {
            combinations.push([base, intermediate, quote]);
          }
        }
      }
    }
    
    return combinations.slice(0, 10); // Limit combinations
  }

  private async getFundingRate(symbol: string, exchange: string): Promise<number | null> {
    // This would fetch the actual funding rate from the exchange API
    // For now, return a mock value
    return Math.random() * 0.001; // 0-0.1% funding rate
  }

  private generateOpportunityId(): string {
    return `opp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private addOpportunity(opportunity: ArbitrageOpportunity): void {
    if (this.activeOpportunities.size >= this.MAX_OPPORTUNITIES) {
      // Remove oldest opportunity
      const oldestId = Array.from(this.activeOpportunities.keys())[0];
      if (oldestId) {
        this.activeOpportunities.delete(oldestId);
      }
    }

    this.activeOpportunities.set(opportunity.id, opportunity);
    this.emit('opportunityFound', opportunity);
  }

  private cleanupExpiredOpportunities(): void {
    const now = Date.now();
    
    for (const [id, opportunity] of this.activeOpportunities) {
      if (opportunity.expires.getTime() < now) {
        this.activeOpportunities.delete(id);
        this.emit('opportunityExpired', id);
      }
    }
  }

  public getActiveOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.activeOpportunities.values());
  }
}
