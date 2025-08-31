import { EventEmitter } from 'events';
import { ArbitrageOpportunity, StrategyConfig, TradePath, RiskFactor, Ticker, OrderBook } from '../types';
import { Logger } from '../utils/Logger';
import * as math from 'mathjs';

interface MLPrediction {
  probability: number;
  confidence: number;
  timeframe: number;
  factors: string[];
}

interface MarketPattern {
  type: 'momentum' | 'reversal' | 'breakout' | 'correlation';
  strength: number;
  timeframe: number;
  assets: string[];
}

export class AdvancedScanner extends EventEmitter {
  private logger: Logger;
  private isActive: boolean = false;
  
  // ML Models (simplified for demo)
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();
  private correlationMatrix: Map<string, Map<string, number>> = new Map();
  
  // Pattern recognition
  private detectedPatterns: MarketPattern[] = [];
  private readonly HISTORY_LENGTH = 100; // Keep last 100 data points
  
  constructor() {
    super();
    this.logger = new Logger('AdvancedScanner');
  }

  public start(): void {
    if (this.isActive) return;
    
    this.logger.info('🧠 Starting advanced ML scanner...');
    this.isActive = true;
    
    // Start pattern detection
    setInterval(() => {
      this.detectMarketPatterns();
    }, 5000); // Every 5 seconds
    
    // Update correlations
    setInterval(() => {
      this.updateCorrelations();
    }, 30000); // Every 30 seconds
    
    this.logger.info('✅ Advanced scanner started');
  }

  public stop(): void {
    if (!this.isActive) return;
    
    this.logger.info('Stopping advanced scanner...');
    this.isActive = false;
    this.logger.info('✅ Advanced scanner stopped');
  }

  // Add new data point for ML processing
  public addDataPoint(symbol: string, exchange: string, ticker: Ticker, orderbook: OrderBook): void {
    const key = `${exchange}:${symbol}`;
    
    // Update price history
    if (!this.priceHistory.has(key)) {
      this.priceHistory.set(key, []);
    }
    const prices = this.priceHistory.get(key)!;
    prices.push(ticker.last);
    if (prices.length > this.HISTORY_LENGTH) {
      prices.shift();
    }
    
    // Update volume history
    if (!this.volumeHistory.has(key)) {
      this.volumeHistory.set(key, []);
    }
    const volumes = this.volumeHistory.get(key)!;
    volumes.push(ticker.volume);
    if (volumes.length > this.HISTORY_LENGTH) {
      volumes.shift();
    }
  }

  // Smart opportunity scoring with ML predictions
  public scoreOpportunity(
    opportunity: ArbitrageOpportunity,
    marketData: Map<string, { ticker: Ticker; orderbook: OrderBook }>
  ): number {
    let score = opportunity.profitPercent; // Base score
    
    // Apply ML predictions
    const prediction = this.predictOpportunitySuccess(opportunity, marketData);
    score *= prediction.probability;
    
    // Pattern-based adjustments
    const patterns = this.getRelevantPatterns(opportunity);
    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'momentum':
          score *= 1.2; // Boost momentum opportunities
          break;
        case 'reversal':
          score *= 0.8; // Reduce reversal opportunities
          break;
        case 'breakout':
          score *= 1.5; // Strong boost for breakouts
          break;
        case 'correlation':
          score *= (1 + pattern.strength * 0.3); // Adjust based on correlation strength
          break;
      }
    }
    
    // Liquidity-based scoring
    const liquidityScore = this.calculateLiquidityScore(opportunity, marketData);
    score *= liquidityScore;
    
    // Volatility adjustment
    const volatilityScore = this.calculateVolatilityScore(opportunity);
    score *= volatilityScore;
    
    return Math.max(0, score);
  }

  // Predict opportunity success using simplified ML
  private predictOpportunitySuccess(
    opportunity: ArbitrageOpportunity,
    marketData: Map<string, { ticker: Ticker; orderbook: OrderBook }>
  ): MLPrediction {
    let probability = 0.7; // Base probability
    let confidence = 0.6; // Base confidence
    const factors: string[] = [];
    
    // Feature 1: Price momentum
    const momentum = this.calculateMomentum(opportunity);
    if (momentum > 0.5) {
      probability += 0.1;
      factors.push('positive_momentum');
    } else if (momentum < -0.5) {
      probability -= 0.1;
      factors.push('negative_momentum');
    }
    
    // Feature 2: Volume trend
    const volumeTrend = this.calculateVolumeTrend(opportunity);
    if (volumeTrend > 1.5) {
      probability += 0.15;
      confidence += 0.1;
      factors.push('high_volume');
    }
    
    // Feature 3: Spread stability
    const spreadStability = this.calculateSpreadStability(opportunity);
    if (spreadStability > 0.8) {
      probability += 0.1;
      confidence += 0.15;
      factors.push('stable_spread');
    }
    
    // Feature 4: Market correlation
    const correlation = this.getMarketCorrelation(opportunity);
    if (Math.abs(correlation) < 0.3) {
      probability += 0.05;
      factors.push('low_correlation');
    }
    
    // Feature 5: Historical success rate
    const historicalSuccess = this.getHistoricalSuccessRate(opportunity.type);
    probability = probability * 0.7 + historicalSuccess * 0.3;
    
    return {
      probability: Math.min(1, Math.max(0, probability)),
      confidence: Math.min(1, Math.max(0, confidence)),
      timeframe: opportunity.estimatedDuration,
      factors
    };
  }

  // Detect market patterns using technical analysis
  private detectMarketPatterns(): void {
    this.detectedPatterns = []; // Reset patterns
    
    for (const [key, prices] of this.priceHistory) {
      if (prices.length < 20) continue; // Need enough data
      
      const [exchange, symbol] = key.split(':');
      if (!exchange || !symbol) continue;
      
      // Momentum pattern
      const momentum = this.detectMomentumPattern(prices);
      if (momentum.strength > 0.6) {
        this.detectedPatterns.push({
          type: 'momentum',
          strength: momentum.strength,
          timeframe: momentum.timeframe,
          assets: [symbol]
        });
      }
      
      // Reversal pattern
      const reversal = this.detectReversalPattern(prices);
      if (reversal.strength > 0.7) {
        this.detectedPatterns.push({
          type: 'reversal',
          strength: reversal.strength,
          timeframe: reversal.timeframe,
          assets: [symbol]
        });
      }
      
      // Breakout pattern
      const breakout = this.detectBreakoutPattern(prices);
      if (breakout.strength > 0.8) {
        this.detectedPatterns.push({
          type: 'breakout',
          strength: breakout.strength,
          timeframe: breakout.timeframe,
          assets: [symbol]
        });
      }
    }
    
    // Detect correlation patterns
    this.detectCorrelationPatterns();
    
    if (this.detectedPatterns.length > 0) {
      this.logger.info(`🔍 Detected ${this.detectedPatterns.length} market patterns`);
      this.emit('patternsDetected', this.detectedPatterns);
    }
  }

  private detectMomentumPattern(prices: number[]): { strength: number; timeframe: number } {
    if (prices.length < 10) return { strength: 0, timeframe: 0 };
    
    // Calculate price changes
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      const change = (prices[i]! - prices[i-1]!) / prices[i-1]!;
      changes.push(change);
    }
    
    // Look for consistent direction
    const recentChanges = changes.slice(-10); // Last 10 changes
    const positiveChanges = recentChanges.filter(c => c > 0).length;
    const negativeChanges = recentChanges.filter(c => c < 0).length;
    
    const strength = Math.abs(positiveChanges - negativeChanges) / recentChanges.length;
    
    return {
      strength,
      timeframe: recentChanges.length
    };
  }

  private detectReversalPattern(prices: number[]): { strength: number; timeframe: number } {
    if (prices.length < 20) return { strength: 0, timeframe: 0 };
    
    // Look for trend reversal using moving averages
    const shortMA = this.calculateMA(prices.slice(-5)); // 5-period MA
    const longMA = this.calculateMA(prices.slice(-15)); // 15-period MA
    const veryLongMA = this.calculateMA(prices.slice(-30)); // 30-period MA
    
    // Check for crossover
    const shortTrend = shortMA - longMA;
    const longTrend = longMA - veryLongMA;
    
    // Reversal strength based on trend divergence
    const strength = Math.abs(shortTrend - longTrend) / Math.max(shortMA, longMA, veryLongMA);
    
    return {
      strength: Math.min(1, strength * 100), // Normalize
      timeframe: 30
    };
  }

  private detectBreakoutPattern(prices: number[]): { strength: number; timeframe: number } {
    if (prices.length < 20) return { strength: 0, timeframe: 0 };
    
    // Calculate support and resistance levels
    const recentPrices = prices.slice(-20);
    const support = Math.min(...recentPrices);
    const resistance = Math.max(...recentPrices);
    const range = resistance - support;
    
    const currentPrice = prices[prices.length - 1]!;
    
    // Check if price is breaking out
    const breakoutThreshold = 0.02; // 2% breakout threshold
    let strength = 0;
    
    if (currentPrice > resistance * (1 + breakoutThreshold)) {
      // Upward breakout
      strength = (currentPrice - resistance) / range;
    } else if (currentPrice < support * (1 - breakoutThreshold)) {
      // Downward breakout
      strength = (support - currentPrice) / range;
    }
    
    return {
      strength: Math.min(1, strength),
      timeframe: 20
    };
  }

  private detectCorrelationPatterns(): void {
    // Check for correlation breakdowns or strengthening
    for (const [asset1, correlations] of this.correlationMatrix) {
      for (const [asset2, correlation] of correlations) {
        if (Math.abs(correlation) > 0.8) {
          // Strong correlation detected
          this.detectedPatterns.push({
            type: 'correlation',
            strength: Math.abs(correlation),
            timeframe: this.HISTORY_LENGTH,
            assets: [asset1, asset2]
          });
        }
      }
    }
  }

  private updateCorrelations(): void {
    const assets = Array.from(this.priceHistory.keys());
    
    for (let i = 0; i < assets.length; i++) {
      const asset1 = assets[i]!;
      if (!this.correlationMatrix.has(asset1)) {
        this.correlationMatrix.set(asset1, new Map());
      }
      
      for (let j = i + 1; j < assets.length; j++) {
        const asset2 = assets[j]!;
        const prices1 = this.priceHistory.get(asset1);
        const prices2 = this.priceHistory.get(asset2);
        
        if (prices1 && prices2 && prices1.length > 10 && prices2.length > 10) {
          const correlation = this.calculateCorrelation(prices1, prices2);
          this.correlationMatrix.get(asset1)!.set(asset2, correlation);
        }
      }
    }
  }

  private calculateCorrelation(prices1: number[], prices2: number[]): number {
    const length = Math.min(prices1.length, prices2.length);
    if (length < 10) return 0;
    
    const x = prices1.slice(-length);
    const y = prices2.slice(-length);
    
    // Calculate returns
    const returns1 = x.slice(1).map((price, i) => (price - x[i]!) / x[i]!);
    const returns2 = y.slice(1).map((price, i) => (price - y[i]!) / y[i]!);
    
    // Pearson correlation coefficient
    const n = returns1.length;
    const sumX = returns1.reduce((a, b) => a + b, 0);
    const sumY = returns2.reduce((a, b) => a + b, 0);
    const sumXY = returns1.reduce((sum, x, i) => sum + x * returns2[i]!, 0);
    const sumX2 = returns1.reduce((sum, x) => sum + x * x, 0);
    const sumY2 = returns2.reduce((sum, y) => sum + y * y, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateMA(prices: number[]): number {
    return prices.reduce((sum, price) => sum + price, 0) / prices.length;
  }

  private calculateMomentum(opportunity: ArbitrageOpportunity): number {
    // Calculate momentum based on recent price movements
    let totalMomentum = 0;
    let count = 0;
    
    for (const path of opportunity.paths) {
      const key = `${path.exchange}:${path.symbol}`;
      const prices = this.priceHistory.get(key);
      if (prices && prices.length > 5) {
        const recentPrices = prices.slice(-5);
        const momentum = (recentPrices[recentPrices.length - 1]! - recentPrices[0]!) / recentPrices[0]!;
        totalMomentum += momentum;
        count++;
      }
    }
    
    return count > 0 ? totalMomentum / count : 0;
  }

  private calculateVolumeTrend(opportunity: ArbitrageOpportunity): number {
    // Calculate volume trend
    let totalTrend = 0;
    let count = 0;
    
    for (const path of opportunity.paths) {
      const key = `${path.exchange}:${path.symbol}`;
      const volumes = this.volumeHistory.get(key);
      if (volumes && volumes.length > 5) {
        const recentVolumes = volumes.slice(-5);
        const avgRecent = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
        const avgOlder = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
        const trend = avgOlder > 0 ? avgRecent / avgOlder : 1;
        totalTrend += trend;
        count++;
      }
    }
    
    return count > 0 ? totalTrend / count : 1;
  }

  private calculateSpreadStability(opportunity: ArbitrageOpportunity): number {
    // Simplified spread stability calculation
    return 0.85; // Mock value for demo
  }

  private getMarketCorrelation(opportunity: ArbitrageOpportunity): number {
    // Get correlation between the exchanges/assets in the opportunity
    if (opportunity.paths.length < 2) return 0;
    
    const key1 = `${opportunity.paths[0]!.exchange}:${opportunity.paths[0]!.symbol}`;
    const key2 = `${opportunity.paths[1]!.exchange}:${opportunity.paths[1]!.symbol}`;
    
    const correlations = this.correlationMatrix.get(key1);
    return correlations?.get(key2) || 0;
  }

  private getHistoricalSuccessRate(opportunityType: string): number {
    // Mock historical success rates for different strategy types
    const successRates: Record<string, number> = {
      'simple': 0.75,
      'triangular': 0.65,
      'perpetual_spot': 0.80,
      'volatility': 0.60
    };
    
    return successRates[opportunityType] || 0.70;
  }

  private calculateLiquidityScore(
    opportunity: ArbitrageOpportunity,
    marketData: Map<string, { ticker: Ticker; orderbook: OrderBook }>
  ): number {
    let totalLiquidity = 0;
    let count = 0;
    
    for (const path of opportunity.paths) {
      const key = `${path.exchange}:${path.symbol}`;
      const data = marketData.get(key);
      if (data) {
        const { orderbook } = data;
        // Calculate liquidity depth
        const bidLiquidity = orderbook.bids.slice(0, 5).reduce((sum, [, amount]) => sum + amount, 0);
        const askLiquidity = orderbook.asks.slice(0, 5).reduce((sum, [, amount]) => sum + amount, 0);
        const avgLiquidity = (bidLiquidity + askLiquidity) / 2;
        
        totalLiquidity += Math.min(1, avgLiquidity / 100); // Normalize to max 1
        count++;
      }
    }
    
    return count > 0 ? totalLiquidity / count : 0.5;
  }

  private calculateVolatilityScore(opportunity: ArbitrageOpportunity): number {
    // Calculate volatility-based score
    let totalVolatility = 0;
    let count = 0;
    
    for (const path of opportunity.paths) {
      const key = `${path.exchange}:${path.symbol}`;
      const prices = this.priceHistory.get(key);
      if (prices && prices.length > 10) {
        // Calculate standard deviation of returns
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
          const return_ = (prices[i]! - prices[i-1]!) / prices[i-1]!;
          returns.push(return_);
        }
        
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);
        
        totalVolatility += volatility;
        count++;
      }
    }
    
    const avgVolatility = count > 0 ? totalVolatility / count : 0.02;
    
    // Lower volatility is better for arbitrage (more predictable)
    return Math.max(0.3, 1 - avgVolatility * 50);
  }

  private getRelevantPatterns(opportunity: ArbitrageOpportunity): MarketPattern[] {
    return this.detectedPatterns.filter(pattern => {
      return opportunity.paths.some(path => 
        pattern.assets.includes(path.symbol.split('/')[0]!) ||
        pattern.assets.includes(path.symbol.split('/')[1]!)
      );
    });
  }

  // Public getters for monitoring
  public getDetectedPatterns(): MarketPattern[] {
    return [...this.detectedPatterns];
  }

  public getCorrelationMatrix(): Map<string, Map<string, number>> {
    return this.correlationMatrix;
  }

  public getPriceHistory(asset: string): number[] {
    return this.priceHistory.get(asset) || [];
  }
}
