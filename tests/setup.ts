// Jest setup file for Matreshka Arbitrage System tests

import { Logger } from '../src/utils/Logger';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests
process.env.DEMO_MODE = 'true';

// Mock external services during tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
  })),
}));

jest.mock('ccxt', () => ({
  binance: jest.fn(() => ({
    id: 'binance',
    has: { fetchOrderBook: true, fetchTicker: true },
    fetchOrderBook: jest.fn(),
    fetchTicker: jest.fn(),
    fetchBalance: jest.fn(),
    createOrder: jest.fn(),
    cancelOrder: jest.fn(),
    fetchOrder: jest.fn(),
  })),
  okx: jest.fn(() => ({
    id: 'okx',
    has: { fetchOrderBook: true, fetchTicker: true },
    fetchOrderBook: jest.fn(),
    fetchTicker: jest.fn(),
    fetchBalance: jest.fn(),
    createOrder: jest.fn(),
    cancelOrder: jest.fn(),
    fetchOrder: jest.fn(),
  })),
}));

// Global test utilities
global.testUtils = {
  createMockOrderBook: (symbol: string, exchange: string) => ({
    symbol,
    exchange,
    bids: [[50000, 1.5], [49950, 2.0]],
    asks: [[50050, 1.2], [50100, 1.8]],
    timestamp: Date.now(),
  }),
  
  createMockTicker: (symbol: string, exchange: string) => ({
    symbol,
    exchange,
    bid: 50000,
    ask: 50050,
    last: 50025,
    volume: 1500,
    change24h: 2.5,
    timestamp: Date.now(),
  }),

  createMockOpportunity: () => ({
    id: 'test-opportunity-123',
    type: 'simple' as const,
    profit: 125.50,
    profitPercent: 0.75,
    volume: 5000,
    paths: [
      {
        step: 1,
        exchange: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy' as const,
        amount: 0.1,
        price: 50000,
        fee: 5,
        estimatedTime: 1000,
      },
      {
        step: 2,
        exchange: 'okx',
        symbol: 'BTC/USDT',
        side: 'sell' as const,
        amount: 0.1,
        price: 50375,
        fee: 5.5,
        estimatedTime: 1200,
      },
    ],
    estimatedDuration: 2200,
    confidence: 0.85,
    risks: [],
    created: new Date(),
    expires: new Date(Date.now() + 60000),
  }),

  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  mockLogger: new Logger('Test', { level: 'error', pretty: false }),
};

// Setup and teardown hooks
beforeAll(async () => {
  // Global setup
});

afterAll(async () => {
  // Global cleanup
});

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});

// Custom matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toHaveProfit(received: any) {
    const pass = received.profit > 0 && received.profitPercent > 0;
    if (pass) {
      return {
        message: () => `expected opportunity not to have profit`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected opportunity to have profit (${received.profit}, ${received.profitPercent}%)`,
        pass: false,
      };
    }
  },
});

// Type declarations for global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toHaveProfit(): R;
    }
  }
  
  var testUtils: {
    createMockOrderBook: (symbol: string, exchange: string) => any;
    createMockTicker: (symbol: string, exchange: string) => any;
    createMockOpportunity: () => any;
    sleep: (ms: number) => Promise<void>;
    mockLogger: Logger;
  };
}
