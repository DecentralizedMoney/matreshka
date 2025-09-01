module.exports = {
  apps: [
    {
      name: 'matreshka-arbitrage',
      script: 'dist/index.js',
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        WEB_PORT: 3000,
        DEMO_MODE: 'true',
      },
      
      // Logging configuration
      log_file: './logs/pm2-combined.log',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process management
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Advanced features
      listen_timeout: 3000,
      kill_timeout: 5000,
      shutdown_with_message: true,
      
      // Monitoring
      monitoring: false,
      pmx: true,
      
      // Node.js options
      node_args: [
        '--max-old-space-size=2048',
        '--optimize-for-size'
      ],
      
      // Health check
      health_check_url: 'http://localhost:3000/health',
      health_check_grace_period: 3000,
    },
    
    // Development configuration
    {
      name: 'matreshka-dev',
      script: 'src/index.ts',
      interpreter: './node_modules/.bin/ts-node',
      interpreter_args: ['--transpile-only'],
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        WEB_PORT: 3001,
        DEMO_MODE: 'true',
      },
      
      // Development specific settings
      watch: ['src'],
      ignore_watch: ['node_modules', 'logs', 'dist'],
      watch_options: {
        followSymlinks: false,
        usePolling: false,
      },
      
      autorestart: true,
      max_memory_restart: '1G',
      
      // Logging
      log_file: './logs/dev-combined.log',
      out_file: './logs/dev-out.log',
      error_file: './logs/dev-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    
    // Monitor mode configuration
    {
      name: 'matreshka-monitor',
      script: 'dist/index.js',
      args: ['--mode=monitor'],
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        WEB_PORT: 3002,
        DEMO_MODE: 'true',
      },
      
      autorestart: true,
      max_memory_restart: '1G',
      
      // Logging
      log_file: './logs/monitor-combined.log',
      out_file: './logs/monitor-out.log',
      error_file: './logs/monitor-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'matreshka',
      host: ['production-server.com'],
      ref: 'origin/main',
      repo: 'https://github.com/brics-trading/matreshka.git',
      path: '/var/www/matreshka',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci --only=production && npm run build:prod && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no'
    },
    
    staging: {
      user: 'matreshka',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'https://github.com/brics-trading/matreshka.git',
      path: '/var/www/matreshka-staging',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env staging',
      'ssh_options': 'StrictHostKeyChecking=no'
    }
  }
};
