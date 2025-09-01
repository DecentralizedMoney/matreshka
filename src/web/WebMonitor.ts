import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { MatreshkaCore } from '../core/MatreshkaCore';
import { Logger } from '../utils/Logger';
import path from 'path';

export class WebMonitor {
  private app: express.Application;
  private server: any;
  private io: Server;
  private matreshka: MatreshkaCore;
  private logger: Logger;
  private port: number;

  constructor(matreshka: MatreshkaCore, port: number = 3001) {
    this.matreshka = matreshka;
    this.port = port;
    this.logger = new Logger('WebMonitor');
    
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupRoutes();
    this.setupSocketHandlers();
    this.setupMatreshkaEventHandlers();
  }

  private setupRoutes(): void {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../web/public')));
    this.app.use(express.json());

    // API Routes
    this.app.get('/api/status', async (req, res) => {
      try {
        const status = await this.matreshka.getSystemStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get system status' });
      }
    });

    this.app.get('/api/opportunities', (req, res) => {
      try {
        const opportunities = this.matreshka.getActiveOpportunities();
        res.json(opportunities);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get opportunities' });
      }
    });

    this.app.get('/api/executions', (req, res) => {
      try {
        const executions = this.matreshka.getActiveExecutions();
        res.json(executions);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get executions' });
      }
    });

    this.app.get('/api/portfolio', async (req, res) => {
      try {
        const portfolio = await this.matreshka.getPortfolioSnapshot();
        res.json(portfolio);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get portfolio' });
      }
    });

    // Oil market data endpoint
    this.app.get('/api/oil/market-data', (req, res) => {
      try {
        const oilData = this.matreshka.getOilMarketData();
        res.json(oilData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get oil market data' });
      }
    });

    // Oil opportunities endpoint
    this.app.get('/api/oil/opportunities', (req, res) => {
      try {
        const opportunities = this.matreshka.getOilOpportunities();
        res.json(opportunities);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get oil opportunities' });
      }
    });

    // Execute oil opportunity endpoint
    this.app.post('/api/oil/execute/:opportunityId', (req, res) => {
      try {
        const { opportunityId } = req.params;
        const success = this.matreshka.executeOilOpportunity(opportunityId);
        res.json({ success, opportunityId });
      } catch (error) {
        res.status(500).json({ error: 'Failed to execute oil opportunity' });
      }
    });

    // Emergency stop endpoint
    this.app.post('/api/emergency-stop', async (req, res) => {
      try {
        this.logger.warn('Emergency stop requested via web interface');
        await this.matreshka.stop();
        res.json({ success: true, message: 'Emergency stop executed' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to execute emergency stop' });
      }
    });

    // Main dashboard
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      this.logger.info(`Web client connected: ${socket.id}`);

      socket.on('requestStatus', async () => {
        try {
          const status = await this.matreshka.getSystemStatus();
          socket.emit('systemStatus', status);
        } catch (error) {
          socket.emit('error', 'Failed to get system status');
        }
      });

      socket.on('disconnect', () => {
        this.logger.debug(`Web client disconnected: ${socket.id}`);
      });
    });
  }

  private setupMatreshkaEventHandlers(): void {
    // Forward Matreshka events to web clients
    this.matreshka.on('opportunityFound', (opportunity) => {
      this.io.emit('opportunityFound', opportunity);
    });

    this.matreshka.on('executionStarted', (execution) => {
      this.io.emit('executionStarted', execution);
    });

    this.matreshka.on('executionCompleted', (execution) => {
      this.io.emit('executionCompleted', execution);
    });

    this.matreshka.on('executionFailed', (data) => {
      this.io.emit('executionFailed', data);
    });

    this.matreshka.on('riskAlert', (alert) => {
      this.io.emit('riskAlert', alert);
    });

    this.matreshka.on('emergencyStop', () => {
      this.io.emit('emergencyStop');
    });

    this.matreshka.on('priceAlert', (alert) => {
      this.io.emit('priceAlert', alert);
    });

    this.matreshka.on('systemStatus', (status) => {
      this.io.emit('systemStatus', status);
    });

    // Oil arbitrage events
    this.matreshka.on('oilOpportunityFound', (opportunity) => {
      this.io.emit('oilOpportunityFound', opportunity);
    });

    this.matreshka.on('oilExecutionStarted', (execution) => {
      this.io.emit('oilExecutionStarted', execution);
    });

    this.matreshka.on('oilExecutionCompleted', (execution) => {
      this.io.emit('oilExecutionCompleted', execution);
    });

    // Send periodic updates
    setInterval(async () => {
      try {
        const status = await this.matreshka.getSystemStatus();
        const opportunities = this.matreshka.getActiveOpportunities();
        const executions = this.matreshka.getActiveExecutions();
        const oilData = this.matreshka.getOilMarketData();

        this.io.emit('periodicUpdate', {
          status,
          opportunities,
          executions,
          oilData,
          timestamp: new Date()
        });
      } catch (error) {
        this.logger.error('Error sending periodic update:', error);
      }
    }, 5000); // Every 5 seconds
  }

  private getDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Matreshka Arbitrage Dashboard</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 300;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-running { background: #4CAF50; }
        .status-stopped { background: #f44336; }
        .status-warning { background: #ff9800; }
        
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: transform 0.2s ease;
        }
        
        .card:hover {
            transform: translateY(-5px);
        }
        
        .card h3 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 1.2rem;
            font-weight: 600;
        }
        
        .metric {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px 0;
            border-bottom: 1px solid #ecf0f1;
        }
        
        .metric:last-child {
            border-bottom: none;
        }
        
        .metric-label {
            color: #7f8c8d;
            font-size: 0.9rem;
        }
        
        .metric-value {
            font-weight: 600;
            color: #2c3e50;
        }
        
        .opportunities-list {
            max-height: 300px;
            overflow-y: auto;
        }
        
        .opportunity {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 10px;
            border-left: 4px solid #28a745;
        }
        
        .opportunity.high-profit {
            border-left-color: #28a745;
        }
        
        .opportunity.medium-profit {
            border-left-color: #ffc107;
        }
        
        .opportunity.low-profit {
            border-left-color: #dc3545;
        }
        
        .controls {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
        }
        
        .btn {
            padding: 12px 24px;
            border-radius: 8px;
            border: none;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-block;
        }
        
        .btn-emergency {
            background: #e74c3c;
            color: white;
        }
        
        .btn-emergency:hover {
            background: #c0392b;
            transform: translateY(-2px);
        }
        
        .btn-refresh {
            background: #3498db;
            color: white;
        }
        
        .btn-refresh:hover {
            background: #2980b9;
            transform: translateY(-2px);
        }
        
        .log-container {
            background: rgba(0, 0, 0, 0.8);
            border-radius: 15px;
            padding: 20px;
            margin-top: 30px;
            color: #00ff00;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .log-entry {
            margin-bottom: 5px;
            opacity: 0;
            animation: fadeIn 0.5s ease forwards;
        }
        
        @keyframes fadeIn {
            to { opacity: 1; }
        }
        
        .log-error { color: #ff6b6b; }
        .log-warning { color: #feca57; }
        .log-success { color: #48dbfb; }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .dashboard {
                grid-template-columns: 1fr;
            }
            
            .controls {
                flex-direction: column;
                align-items: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🪆 Matreshka Arbitrage System</h1>
            <p>
                <span class="status-indicator" id="statusIndicator"></span>
                <span id="systemStatus">Connecting...</span>
            </p>
        </div>
        
        <div class="dashboard">
            <div class="card">
                <h3>📊 System Status</h3>
                <div class="metric">
                    <span class="metric-label">Uptime</span>
                    <span class="metric-value" id="uptime">--</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Active Connections</span>
                    <span class="metric-value" id="activeConnections">--</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Memory Usage</span>
                    <span class="metric-value" id="memoryUsage">--</span>
                </div>
                <div class="metric">
                    <span class="metric-label">CPU Usage</span>
                    <span class="metric-value" id="cpuUsage">--</span>
                </div>
            </div>
            
            <div class="card">
                <h3>🎯 Active Opportunities</h3>
                <div class="metric">
                    <span class="metric-label">Total Found</span>
                    <span class="metric-value" id="totalOpportunities">0</span>
                </div>
                <div class="opportunities-list" id="opportunitiesList">
                    <p style="color: #7f8c8d; text-align: center; padding: 20px;">
                        No opportunities found yet...
                    </p>
                </div>
            </div>
            
            <div class="card">
                <h3>⚡ Executions</h3>
                <div class="metric">
                    <span class="metric-label">Active Executions</span>
                    <span class="metric-value" id="activeExecutions">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Total Profit (Today)</span>
                    <span class="metric-value" id="totalProfit">$0.00</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Success Rate</span>
                    <span class="metric-value" id="successRate">--</span>
                </div>
            </div>
            
            <div class="card">
                <h3>💼 Portfolio</h3>
                <div id="portfolioInfo">
                    <p style="color: #7f8c8d; text-align: center; padding: 20px;">
                        Loading portfolio data...
                    </p>
                </div>
            </div>
        </div>
        
        <div class="controls">
            <button class="btn btn-refresh" onclick="refreshData()">
                🔄 Refresh Data
            </button>
            <button class="btn btn-emergency" onclick="emergencyStop()">
                🚨 Emergency Stop
            </button>
        </div>
        
        <div class="log-container">
            <div id="logContainer">
                <div class="log-entry log-success">🚀 Matreshka Dashboard Connected</div>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        let systemRunning = false;
        
        // Socket event handlers
        socket.on('connect', () => {
            addLog('📡 Connected to Matreshka server', 'success');
            socket.emit('requestStatus');
        });
        
        socket.on('disconnect', () => {
            addLog('📡 Disconnected from server', 'error');
            updateSystemStatus(false);
        });
        
        socket.on('systemStatus', (status) => {
            updateSystemMetrics(status);
        });
        
        socket.on('opportunityFound', (opportunity) => {
            addLog(\`🎯 New opportunity: \${opportunity.profitPercent.toFixed(4)}% profit (\${opportunity.type})\`, 'success');
            updateOpportunities();
        });
        
        socket.on('executionStarted', (execution) => {
            addLog(\`🚀 Execution started: \${execution.opportunityId}\`, 'info');
        });
        
        socket.on('executionCompleted', (execution) => {
            addLog(\`✅ Execution completed: $\${execution.totalProfit.toFixed(2)} profit\`, 'success');
        });
        
        socket.on('executionFailed', (data) => {
            addLog(\`❌ Execution failed: \${data.execution.opportunityId}\`, 'error');
        });
        
        socket.on('riskAlert', (alert) => {
            addLog(\`⚠️ Risk alert: \${alert.limit} exceeded\`, 'warning');
        });
        
        socket.on('emergencyStop', () => {
            addLog('🚨 EMERGENCY STOP TRIGGERED', 'error');
            updateSystemStatus(false);
        });
        
        socket.on('priceAlert', (alert) => {
            addLog(\`📈 \${alert.symbol} on \${alert.exchange}: $\${alert.price} (\${alert.change.toFixed(2)}%)\`, 'info');
        });
        
        socket.on('periodicUpdate', (data) => {
            updateSystemMetrics(data.status);
            updateOpportunitiesDisplay(data.opportunities);
            updateExecutionsDisplay(data.executions);
        });
        
        // UI update functions
        function updateSystemStatus(running) {
            systemRunning = running;
            const indicator = document.getElementById('statusIndicator');
            const status = document.getElementById('systemStatus');
            
            if (running) {
                indicator.className = 'status-indicator status-running';
                status.textContent = 'Running';
            } else {
                indicator.className = 'status-indicator status-stopped';
                status.textContent = 'Stopped';
            }
        }
        
        function updateSystemMetrics(status) {
            if (!status) return;
            
            updateSystemStatus(true);
            document.getElementById('uptime').textContent = formatUptime(status.uptime);
            document.getElementById('activeConnections').textContent = status.activeConnections || 0;
            document.getElementById('memoryUsage').textContent = formatMemory(status.memoryUsage?.heapUsed || 0);
            document.getElementById('cpuUsage').textContent = \`\${(status.cpuUsage || 0).toFixed(1)}%\`;
        }
        
        function updateOpportunitiesDisplay(opportunities) {
            const container = document.getElementById('opportunitiesList');
            const total = document.getElementById('totalOpportunities');
            
            total.textContent = opportunities.length;
            
            if (opportunities.length === 0) {
                container.innerHTML = '<p style="color: #7f8c8d; text-align: center; padding: 20px;">No opportunities found yet...</p>';
                return;
            }
            
            container.innerHTML = opportunities.map(opp => {
                const profitClass = opp.profitPercent > 1 ? 'high-profit' : 
                                   opp.profitPercent > 0.5 ? 'medium-profit' : 'low-profit';
                
                return \`
                    <div class="opportunity \${profitClass}">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <strong>\${opp.type.toUpperCase()}</strong>
                            <span style="color: #28a745; font-weight: bold;">\${opp.profitPercent.toFixed(4)}%</span>
                        </div>
                        <div style="font-size: 0.9rem; color: #6c757d;">
                            Profit: $\${opp.profit.toFixed(2)} | Volume: \${opp.volume.toFixed(2)}
                        </div>
                        <div style="font-size: 0.8rem; color: #6c757d;">
                            Confidence: \${(opp.confidence * 100).toFixed(1)}%
                        </div>
                    </div>
                \`;
            }).join('');
        }
        
        function updateExecutionsDisplay(executions) {
            document.getElementById('activeExecutions').textContent = executions.length;
        }
        
        function addLog(message, type = 'info') {
            const container = document.getElementById('logContainer');
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.className = \`log-entry log-\${type}\`;
            logEntry.innerHTML = \`[\${timestamp}] \${message}\`;
            
            container.appendChild(logEntry);
            container.scrollTop = container.scrollHeight;
            
            // Keep only last 50 log entries
            const entries = container.children;
            if (entries.length > 50) {
                container.removeChild(entries[0]);
            }
        }
        
        function formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            return \`\${hours}h \${minutes}m \${secs}s\`;
        }
        
        function formatMemory(bytes) {
            const mb = bytes / (1024 * 1024);
            return \`\${mb.toFixed(1)} MB\`;
        }
        
        // Control functions
        function refreshData() {
            addLog('🔄 Refreshing data...', 'info');
            socket.emit('requestStatus');
            
            fetch('/api/opportunities')
                .then(r => r.json())
                .then(opportunities => updateOpportunitiesDisplay(opportunities))
                .catch(e => addLog('Error refreshing opportunities', 'error'));
        }
        
        function emergencyStop() {
            if (confirm('Are you sure you want to execute an emergency stop?')) {
                addLog('🚨 Executing emergency stop...', 'warning');
                
                fetch('/api/emergency-stop', { method: 'POST' })
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) {
                            addLog('✅ Emergency stop completed', 'success');
                            updateSystemStatus(false);
                        } else {
                            addLog('❌ Emergency stop failed', 'error');
                        }
                    })
                    .catch(e => {
                        addLog('❌ Emergency stop request failed', 'error');
                    });
            }
        }
        
        // Auto-refresh every 30 seconds
        setInterval(() => {
            if (systemRunning) {
                refreshData();
            }
        }, 30000);
    </script>
</body>
</html>
    `;
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        this.logger.info(`🌐 Web monitor started on http://localhost:${this.port}`);
        resolve();
      }).on('error', (error: any) => {
        this.logger.error('Failed to start web monitor:', error);
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('Web monitor stopped');
        resolve();
      });
    });
  }

  public getPort(): number {
    return this.port;
  }
}
