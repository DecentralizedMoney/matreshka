import { EventEmitter } from 'events';
import { 
  OilContract, 
  OilSpread, 
  OilArbitrageOpportunity, 
  OilMarketData,
  StrategyConfig,
  ArbitrageOpportunity,
  TradePath
} from '../types';
import { Logger } from '../utils/Logger';
import { RiskManager } from './RiskManager';

export class OilArbitrageEngine extends EventEmitter {
  private logger: Logger;
  private riskManager: RiskManager;
  private strategies: StrategyConfig[];
  
  private oilContracts: Map<string, OilContract> = new Map();
  private activeSpreads: Map<string, OilSpread> = new Map();
  private opportunities: Map<string, OilArbitrageOpportunity> = new Map();
  
  private isRunning: boolean = false;
  private scanInterval?: NodeJS.Timeout;
  
  // Oil-specific symbols
  private readonly OIL_SYMBOLS = {
    BRENT: ['BRENT', 'BZ', 'Brent Crude'],
    WTI: ['WTI', 'CL', 'West Texas Intermediate'],
    FUTURES: ['BRENT-2024-01', 'BRENT-2024-02', 'BRENT-2024-03', 'WTI-2024-01', 'WTI-2024-02', 'WTI-2024-03'],
    CRACK_SPREADS: ['RBOB-BRENT', 'HEAT-BRENT', 'RBOB-WTI', 'HEAT-WTI']
  };

  constructor(strategies: StrategyConfig[], riskManager: RiskManager) {
    super();
    this.strategies = strategies.filter(s => s.type.includes('oil'));
    this.riskManager = riskManager;
    this.logger = new Logger('OilArbitrageEngine');
  }

  public start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.logger.info('🛢️ Starting Oil Arbitrage Engine...');
    
    // Initialize demo data
    this.initializeDemoData();
    
    // Start scanning for opportunities
    this.scanInterval = setInterval(() => {
      this.scanOpportunities();
    }, 2000); // Scan every 2 seconds
    
    this.emit('oilEngineStarted');
  }

  public stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }
    
    this.logger.info('🛢️ Oil Arbitrage Engine stopped');
    this.emit('oilEngineStopped');
  }

  private initializeDemoData(): void {
    // Initialize Brent contracts
    const brentSpot: OilContract = {
      symbol: 'BRENT',
      type: 'spot',
      exchange: 'ICE',
      contractSize: 1000,
      tickSize: 0.01,
      lastPrice: 82.45,
      bid: 82.40,
      ask: 82.50,
      volume: 150000,
      openInterest: 0,
      settlementPrice: 82.45,
      timestamp: Date.now()
    };

    const brentJan24: OilContract = {
      symbol: 'BRENT-2024-01',
      type: 'futures',
      exchange: 'ICE',
      deliveryMonth: '2024-01',
      contractSize: 1000,
      tickSize: 0.01,
      lastPrice: 83.20,
      bid: 83.15,
      ask: 83.25,
      volume: 50000,
      openInterest: 250000,
      settlementPrice: 83.20,
      timestamp: Date.now()
    };

    const brentFeb24: OilContract = {
      symbol: 'BRENT-2024-02',
      type: 'futures',
      exchange: 'ICE',
      deliveryMonth: '2024-02',
      contractSize: 1000,
      tickSize: 0.01,
      lastPrice: 83.80,
      bid: 83.75,
      ask: 83.85,
      volume: 30000,
      openInterest: 180000,
      settlementPrice: 83.80,
      timestamp: Date.now()
    };

    // Initialize WTI contracts
    const wtiSpot: OilContract = {
      symbol: 'WTI',
      type: 'spot',
      exchange: 'NYMEX',
      contractSize: 1000,
      tickSize: 0.01,
      lastPrice: 78.30,
      bid: 78.25,
      ask: 78.35,
      volume: 120000,
      openInterest: 0,
      settlementPrice: 78.30,
      timestamp: Date.now()
    };

    const wtiJan24: OilContract = {
      symbol: 'WTI-2024-01',
      type: 'futures',
      exchange: 'NYMEX',
      deliveryMonth: '2024-01',
      contractSize: 1000,
      tickSize: 0.01,
      lastPrice: 79.10,
      bid: 79.05,
      ask: 79.15,
      volume: 45000,
      openInterest: 220000,
      settlementPrice: 79.10,
      timestamp: Date.now()
    };

    // Store contracts
    this.oilContracts.set('BRENT', brentSpot);
    this.oilContracts.set('BRENT-2024-01', brentJan24);
    this.oilContracts.set('BRENT-2024-02', brentFeb24);
    this.oilContracts.set('WTI', wtiSpot);
    this.oilContracts.set('WTI-2024-01', wtiJan24);

    // Create spreads
    this.createSpreads();
    
    this.logger.info('🛢️ Demo oil data initialized');
  }

  private createSpreads(): void {
    const brentSpot = this.oilContracts.get('BRENT')!;
    const brentJan24 = this.oilContracts.get('BRENT-2024-01')!;
    const brentFeb24 = this.oilContracts.get('BRENT-2024-02')!;
    const wtiSpot = this.oilContracts.get('WTI')!;
    const wtiJan24 = this.oilContracts.get('WTI-2024-01')!;

    // Calendar spread (Jan-Feb)
    const calendarSpread: OilSpread = {
      id: 'BRENT-CALENDAR-JAN-FEB',
      type: 'calendar',
      longContract: brentFeb24,
      shortContract: brentJan24,
      spreadValue: brentFeb24.lastPrice - brentJan24.lastPrice,
      historicalAverage: 0.60,
      volatility: 0.15,
      liquidity: 0.8,
      opportunities: []
    };

    // Location arbitrage (Brent-WTI)
    const locationSpread: OilSpread = {
      id: 'BRENT-WTI-LOCATION',
      type: 'location',
      longContract: brentSpot,
      shortContract: wtiSpot,
      spreadValue: brentSpot.lastPrice - wtiSpot.lastPrice,
      historicalAverage: 4.15,
      volatility: 0.25,
      liquidity: 0.9,
      opportunities: []
    };

    this.activeSpreads.set(calendarSpread.id, calendarSpread);
    this.activeSpreads.set(locationSpread.id, locationSpread);
  }

  private scanOpportunities(): void {
    if (!this.isRunning) return;

    try {
      // Scan for calendar spread opportunities
      this.scanCalendarSpreads();
      
      // Scan for location arbitrage
      this.scanLocationArbitrage();
      
      // Scan for crack spreads
      this.scanCrackSpreads();
      
      // Update market data
      this.updateMarketData();
      
    } catch (error) {
      this.logger.error('Error scanning oil opportunities:', error);
    }
  }

  private scanCalendarSpreads(): void {
    const calendarSpread = this.activeSpreads.get('BRENT-CALENDAR-JAN-FEB');
    if (!calendarSpread) return;

    const currentSpread = calendarSpread.spreadValue;
    const historicalAvg = calendarSpread.historicalAverage;
    const deviation = Math.abs(currentSpread - historicalAvg);
    const threshold = historicalAvg * 0.1; // 10% threshold

    if (deviation > threshold) {
      const opportunity: OilArbitrageOpportunity = {
        id: `oil-calendar-${Date.now()}`,
        type: 'calendar_spread',
        profit: deviation * 1000, // 1000 barrels per contract
        profitPercent: (deviation / historicalAvg) * 100,
        volume: 1000,
        contracts: [calendarSpread.longContract, calendarSpread.shortContract],
        strategy: currentSpread > historicalAvg ? 'Long Far, Short Near' : 'Short Far, Long Near',
        riskLevel: 'medium',
        estimatedDuration: 3600, // 1 hour
        confidence: 0.85,
        created: new Date(),
        expires: new Date(Date.now() + 3600000) // 1 hour
      };

      this.opportunities.set(opportunity.id, opportunity);
      this.emit('oilOpportunityFound', opportunity);
      
      this.logger.info(`🎯 Calendar spread opportunity: ${opportunity.strategy}, profit: $${opportunity.profit.toFixed(2)}`);
    }
  }

  private scanLocationArbitrage(): void {
    const locationSpread = this.activeSpreads.get('BRENT-WTI-LOCATION');
    if (!locationSpread) return;

    const currentSpread = locationSpread.spreadValue;
    const historicalAvg = locationSpread.historicalAverage;
    const deviation = Math.abs(currentSpread - historicalAvg);
    const threshold = historicalAvg * 0.15; // 15% threshold

    if (deviation > threshold) {
      const opportunity: OilArbitrageOpportunity = {
        id: `oil-location-${Date.now()}`,
        type: 'location_arbitrage',
        profit: deviation * 1000,
        profitPercent: (deviation / historicalAvg) * 100,
        volume: 1000,
        contracts: [locationSpread.longContract, locationSpread.shortContract],
        strategy: currentSpread > historicalAvg ? 'Long Brent, Short WTI' : 'Short Brent, Long WTI',
        riskLevel: 'low',
        estimatedDuration: 7200, // 2 hours
        confidence: 0.9,
        created: new Date(),
        expires: new Date(Date.now() + 7200000) // 2 hours
      };

      this.opportunities.set(opportunity.id, opportunity);
      this.emit('oilOpportunityFound', opportunity);
      
      this.logger.info(`🎯 Location arbitrage opportunity: ${opportunity.strategy}, profit: $${opportunity.profit.toFixed(2)}`);
    }
  }

  private scanCrackSpreads(): void {
    // Simulate crack spread opportunities
    const crackSpread = Math.random() * 20 + 10; // $10-30 per barrel
    const historicalCrack = 15;
    
    if (Math.abs(crackSpread - historicalCrack) > 5) {
      const opportunity: OilArbitrageOpportunity = {
        id: `oil-crack-${Date.now()}`,
        type: 'crack_spread',
        profit: Math.abs(crackSpread - historicalCrack) * 1000,
        profitPercent: (Math.abs(crackSpread - historicalCrack) / historicalCrack) * 100,
        volume: 1000,
        contracts: [], // Would include refined products
        strategy: crackSpread > historicalCrack ? 'Long Crack Spread' : 'Short Crack Spread',
        riskLevel: 'high',
        estimatedDuration: 1800, // 30 minutes
        confidence: 0.7,
        created: new Date(),
        expires: new Date(Date.now() + 1800000) // 30 minutes
      };

      this.opportunities.set(opportunity.id, opportunity);
      this.emit('oilOpportunityFound', opportunity);
      
      this.logger.info(`🎯 Crack spread opportunity: ${opportunity.strategy}, profit: $${opportunity.profit.toFixed(2)}`);
    }
  }

  private updateMarketData(): void {
    // Simulate price movements
    this.oilContracts.forEach((contract, symbol) => {
      const priceChange = (Math.random() - 0.5) * 0.5; // ±0.25% change
      contract.lastPrice *= (1 + priceChange);
      contract.bid = contract.lastPrice * 0.999;
      contract.ask = contract.lastPrice * 1.001;
      contract.timestamp = Date.now();
      
      this.oilContracts.set(symbol, contract);
    });

    // Update spreads
    this.activeSpreads.forEach((spread, id) => {
      spread.spreadValue = spread.longContract.lastPrice - spread.shortContract.lastPrice;
      spread.opportunities = Array.from(this.opportunities.values())
        .filter(opp => opp.type.includes(spread.type));
      
      this.activeSpreads.set(id, spread);
    });
  }

  public getOilMarketData(): OilMarketData {
    const brent = this.oilContracts.get('BRENT')!;
    const wti = this.oilContracts.get('WTI')!;
    const spreads = Array.from(this.activeSpreads.values());
    const arbitrageOpportunities = Array.from(this.opportunities.values());
    
    // Calculate market sentiment
    const brentChange = (brent.lastPrice - brent.settlementPrice) / brent.settlementPrice;
    const wtiChange = (wti.lastPrice - wti.settlementPrice) / wti.settlementPrice;
    const avgChange = (brentChange + wtiChange) / 2;
    
    const marketSentiment = avgChange > 0.01 ? 'bullish' : avgChange < -0.01 ? 'bearish' : 'neutral';
    
    // Calculate contango/backwardation
    const brentSpot = this.oilContracts.get('BRENT')!;
    const brentJan24 = this.oilContracts.get('BRENT-2024-01')!;
    const contango = brentJan24.lastPrice - brentSpot.lastPrice;
    
    return {
      brent,
      wti,
      spreads,
      arbitrageOpportunities,
      marketSentiment,
      volatilityIndex: 0.25,
      contango
    };
  }

  public getActiveOpportunities(): OilArbitrageOpportunity[] {
    return Array.from(this.opportunities.values())
      .filter(opp => opp.expires > new Date());
  }

  public executeOpportunity(opportunityId: string): boolean {
    const opportunity = this.opportunities.get(opportunityId);
    if (!opportunity) {
      this.logger.warn(`Opportunity ${opportunityId} not found`);
      return false;
    }

    if (opportunity.expires < new Date()) {
      this.logger.warn(`Opportunity ${opportunityId} has expired`);
      return false;
    }

    // Simulate execution
    this.logger.info(`🚀 Executing oil opportunity: ${opportunityId}, strategy: ${opportunity.strategy}`);
    this.emit('oilExecutionStarted', opportunity);
    
    // Remove from active opportunities
    this.opportunities.delete(opportunityId);
    
    // Simulate completion after delay
    setTimeout(() => {
      this.emit('oilExecutionCompleted', {
        opportunityId,
        profit: opportunity.profit,
        strategy: opportunity.strategy,
        executionTime: Date.now() - opportunity.created.getTime()
      });
    }, 2000);

    return true;
  }
}
