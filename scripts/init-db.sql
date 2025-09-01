-- Matreshka Arbitrage System Database Initialization
-- This script creates the necessary tables for the production system

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS monitoring;
CREATE SCHEMA IF NOT EXISTS analytics;

-- Trading tables
CREATE TABLE IF NOT EXISTS trading.exchanges (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading.trading_pairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    base_asset VARCHAR(10) NOT NULL,
    quote_asset VARCHAR(10) NOT NULL,
    exchange_id VARCHAR(50) REFERENCES trading.exchanges(id),
    active BOOLEAN DEFAULT true,
    precision_amount INTEGER DEFAULT 8,
    precision_price INTEGER DEFAULT 8,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(symbol, exchange_id)
);

CREATE TABLE IF NOT EXISTS trading.opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    profit_usd DECIMAL(20, 8) NOT NULL,
    profit_percent DECIMAL(10, 6) NOT NULL,
    volume_usd DECIMAL(20, 8) NOT NULL,
    confidence DECIMAL(3, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'detected',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading.executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id UUID REFERENCES trading.opportunities(id),
    status VARCHAR(20) DEFAULT 'pending',
    total_profit_usd DECIMAL(20, 8) DEFAULT 0,
    total_fees_usd DECIMAL(20, 8) DEFAULT 0,
    execution_time_ms INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS trading.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID REFERENCES trading.executions(id),
    exchange_id VARCHAR(50) REFERENCES trading.exchanges(id),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    amount DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    filled_amount DECIMAL(20, 8) DEFAULT 0,
    average_price DECIMAL(20, 8) DEFAULT 0,
    fee DECIMAL(20, 8) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    order_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    filled_at TIMESTAMP WITH TIME ZONE
);

-- Portfolio tables
CREATE TABLE IF NOT EXISTS trading.balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_id VARCHAR(50) REFERENCES trading.exchanges(id),
    asset VARCHAR(10) NOT NULL,
    free_amount DECIMAL(20, 8) DEFAULT 0,
    locked_amount DECIMAL(20, 8) DEFAULT 0,
    total_amount DECIMAL(20, 8) GENERATED ALWAYS AS (free_amount + locked_amount) STORED,
    value_usd DECIMAL(20, 8) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exchange_id, asset)
);

-- Monitoring tables
CREATE TABLE IF NOT EXISTS monitoring.system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(20, 8) NOT NULL,
    metric_unit VARCHAR(20),
    tags JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring.error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    stack_trace TEXT,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring.performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total_trades INTEGER DEFAULT 0,
    successful_trades INTEGER DEFAULT 0,
    total_profit_usd DECIMAL(20, 8) DEFAULT 0,
    total_fees_usd DECIMAL(20, 8) DEFAULT 0,
    average_execution_time_ms INTEGER DEFAULT 0,
    best_opportunity_profit DECIMAL(20, 8) DEFAULT 0,
    worst_opportunity_profit DECIMAL(20, 8) DEFAULT 0,
    sharpe_ratio DECIMAL(10, 6),
    max_drawdown DECIMAL(10, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics tables
CREATE TABLE IF NOT EXISTS analytics.market_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_id VARCHAR(50) REFERENCES trading.exchanges(id),
    symbol VARCHAR(20) NOT NULL,
    data_type VARCHAR(20) NOT NULL,
    data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON trading.opportunities(created_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON trading.opportunities(type);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON trading.opportunities(status);

CREATE INDEX IF NOT EXISTS idx_executions_opportunity_id ON trading.executions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON trading.executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_started_at ON trading.executions(started_at);

CREATE INDEX IF NOT EXISTS idx_trades_execution_id ON trading.trades(execution_id);
CREATE INDEX IF NOT EXISTS idx_trades_exchange_id ON trading.trades(exchange_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trading.trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trading.trades(created_at);

CREATE INDEX IF NOT EXISTS idx_balances_exchange_asset ON trading.balances(exchange_id, asset);
CREATE INDEX IF NOT EXISTS idx_balances_updated_at ON trading.balances(updated_at);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name_timestamp ON monitoring.system_metrics(metric_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_category_created ON monitoring.error_logs(category, created_at);
CREATE INDEX IF NOT EXISTS idx_market_data_exchange_symbol_timestamp ON analytics.market_data(exchange_id, symbol, timestamp);

-- Insert initial data
INSERT INTO trading.exchanges (id, name, type) VALUES 
    ('binance', 'Binance', 'cex'),
    ('binance_perpetual', 'Binance Futures', 'perpetual'),
    ('whitebit', 'WhiteBIT', 'cex'),
    ('okx', 'OKX', 'cex'),
    ('demo', 'Demo Exchange', 'demo')
ON CONFLICT (id) DO NOTHING;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating timestamps
CREATE TRIGGER update_exchanges_updated_at BEFORE UPDATE ON trading.exchanges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_balances_updated_at BEFORE UPDATE ON trading.balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT USAGE ON SCHEMA trading TO matreshka;
GRANT USAGE ON SCHEMA monitoring TO matreshka;
GRANT USAGE ON SCHEMA analytics TO matreshka;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA trading TO matreshka;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA monitoring TO matreshka;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA analytics TO matreshka;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA trading TO matreshka;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA monitoring TO matreshka;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA analytics TO matreshka;

-- Create views for analytics
CREATE OR REPLACE VIEW analytics.daily_performance AS
SELECT 
    DATE(completed_at) as date,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_executions,
    SUM(total_profit_usd) as total_profit,
    SUM(total_fees_usd) as total_fees,
    AVG(execution_time_ms) as avg_execution_time
FROM trading.executions 
WHERE completed_at IS NOT NULL
GROUP BY DATE(completed_at)
ORDER BY date DESC;

CREATE OR REPLACE VIEW analytics.exchange_performance AS
SELECT 
    t.exchange_id,
    e.name as exchange_name,
    COUNT(*) as total_trades,
    SUM(t.amount * t.average_price) as total_volume_usd,
    SUM(t.fee) as total_fees
FROM trading.trades t
JOIN trading.exchanges e ON t.exchange_id = e.id
WHERE t.status = 'filled'
GROUP BY t.exchange_id, e.name
ORDER BY total_volume_usd DESC;

GRANT SELECT ON analytics.daily_performance TO matreshka;
GRANT SELECT ON analytics.exchange_performance TO matreshka;
