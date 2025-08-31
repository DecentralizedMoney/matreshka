import { EventEmitter } from 'events';
import { ArbitrageOpportunity, ArbitrageExecution } from '../types';
import { Logger } from '../utils/Logger';
import axios from 'axios';

interface NotificationChannel {
  id: string;
  type: 'telegram' | 'discord' | 'email' | 'webhook' | 'console';
  enabled: boolean;
  config: any;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface NotificationMessage {
  id: string;
  type: 'opportunity' | 'execution' | 'risk' | 'system' | 'pattern';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
  channels: string[];
}

export class NotificationSystem extends EventEmitter {
  private logger: Logger;
  private channels: Map<string, NotificationChannel> = new Map();
  private messageQueue: NotificationMessage[] = [];
  private isProcessing: boolean = false;
  private processInterval?: NodeJS.Timeout;

  // Rate limiting
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_MESSAGES_PER_MINUTE = 10;

  constructor() {
    super();
    this.logger = new Logger('NotificationSystem');
    this.initializeChannels();
  }

  private initializeChannels(): void {
    // Console channel (always available)
    this.channels.set('console', {
      id: 'console',
      type: 'console',
      enabled: true,
      config: {},
      priority: 'low'
    });

    // Telegram channel
    if (process.env['TELEGRAM_BOT_TOKEN'] && process.env['TELEGRAM_CHAT_ID']) {
      this.channels.set('telegram', {
        id: 'telegram',
        type: 'telegram',
        enabled: true,
        config: {
          botToken: process.env['TELEGRAM_BOT_TOKEN'],
          chatId: process.env['TELEGRAM_CHAT_ID']
        },
        priority: 'medium'
      });
    }

    // Discord channel
    if (process.env['DISCORD_WEBHOOK_URL']) {
      this.channels.set('discord', {
        id: 'discord',
        type: 'discord',
        enabled: true,
        config: {
          webhookUrl: process.env['DISCORD_WEBHOOK_URL']
        },
        priority: 'medium'
      });
    }

    // Email channel
    if (process.env['EMAIL_SMTP_HOST']) {
      this.channels.set('email', {
        id: 'email',
        type: 'email',
        enabled: true,
        config: {
          host: process.env['EMAIL_SMTP_HOST'],
          user: process.env['EMAIL_SMTP_USER'],
          pass: process.env['EMAIL_SMTP_PASS']
        },
        priority: 'high'
      });
    }

    this.logger.info(`📬 Initialized ${this.channels.size} notification channels`);
  }

  public start(): void {
    if (this.isProcessing) return;

    this.logger.info('📨 Starting notification system...');
    this.isProcessing = true;

    // Process message queue every second
    this.processInterval = setInterval(() => {
      this.processMessageQueue();
    }, 1000);

    this.logger.info('✅ Notification system started');
  }

  public stop(): void {
    if (!this.isProcessing) return;

    this.logger.info('Stopping notification system...');
    this.isProcessing = false;

    if (this.processInterval) {
      clearInterval(this.processInterval);
    }

    this.logger.info('✅ Notification system stopped');
  }

  // Send opportunity notifications
  public notifyOpportunity(opportunity: ArbitrageOpportunity): void {
    const priority = this.determineOpportunityPriority(opportunity);
    const channels = this.getChannelsForPriority(priority);

    const message: NotificationMessage = {
      id: `opp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'opportunity',
      priority,
      title: '🎯 New Arbitrage Opportunity',
      message: this.formatOpportunityMessage(opportunity),
      data: opportunity,
      timestamp: new Date(),
      channels
    };

    this.queueMessage(message);
  }

  // Send execution notifications
  public notifyExecution(execution: ArbitrageExecution, status: 'started' | 'completed' | 'failed'): void {
    const priority = status === 'failed' ? 'high' : 'medium';
    const channels = this.getChannelsForPriority(priority);

    let title = '';
    let emoji = '';
    switch (status) {
      case 'started':
        title = 'Execution Started';
        emoji = '🚀';
        break;
      case 'completed':
        title = 'Execution Completed';
        emoji = '✅';
        break;
      case 'failed':
        title = 'Execution Failed';
        emoji = '❌';
        break;
    }

    const message: NotificationMessage = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'execution',
      priority,
      title: `${emoji} ${title}`,
      message: this.formatExecutionMessage(execution, status),
      data: { execution, status },
      timestamp: new Date(),
      channels
    };

    this.queueMessage(message);
  }

  // Send risk alerts
  public notifyRiskAlert(alert: { limit: string; value: number; threshold: number }): void {
    const priority = 'high';
    const channels = this.getChannelsForPriority(priority);

    const message: NotificationMessage = {
      id: `risk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'risk',
      priority,
      title: '⚠️ Risk Alert',
      message: `Risk limit exceeded!\n\n` +
               `**Limit:** ${alert.limit}\n` +
               `**Current Value:** ${alert.value.toFixed(2)}\n` +
               `**Threshold:** ${alert.threshold.toFixed(2)}\n\n` +
               `*Please review your positions and risk settings.*`,
      data: alert,
      timestamp: new Date(),
      channels
    };

    this.queueMessage(message);
  }

  // Send emergency notifications
  public notifyEmergency(message: string, data?: any): void {
    const priority = 'critical';
    const channels = Array.from(this.channels.keys()); // Send to all channels

    const notification: NotificationMessage = {
      id: `emergency_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'system',
      priority,
      title: '🚨 EMERGENCY ALERT',
      message: `**CRITICAL SYSTEM ALERT**\n\n${message}\n\n*Immediate attention required!*`,
      data,
      timestamp: new Date(),
      channels
    };

    // Emergency messages bypass queue and rate limits
    this.sendMessageDirectly(notification);
  }

  // Send pattern detection notifications
  public notifyPatternDetected(patterns: any[]): void {
    if (patterns.length === 0) return;

    const priority = 'low';
    const channels = this.getChannelsForPriority(priority);

    const strongPatterns = patterns.filter(p => p.strength > 0.7);
    if (strongPatterns.length === 0) return;

    const message: NotificationMessage = {
      id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'pattern',
      priority,
      title: '🔍 Market Patterns Detected',
      message: this.formatPatternMessage(strongPatterns),
      data: patterns,
      timestamp: new Date(),
      channels
    };

    this.queueMessage(message);
  }

  private queueMessage(message: NotificationMessage): void {
    // Check rate limits
    if (!this.checkRateLimit(message)) {
      this.logger.warn(`Rate limit exceeded for ${message.type} notifications`);
      return;
    }

    this.messageQueue.push(message);

    // Sort by priority
    this.messageQueue.sort((a, b) => {
      const priorities = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorities[b.priority] - priorities[a.priority];
    });

    // Limit queue size
    if (this.messageQueue.length > 100) {
      this.messageQueue = this.messageQueue.slice(0, 100);
    }
  }

  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    const message = this.messageQueue.shift();
    if (!message) return;

    try {
      await this.sendMessageToChannels(message);
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
    }
  }

  private async sendMessageToChannels(message: NotificationMessage): Promise<void> {
    const promises = message.channels.map(channelId => {
      const channel = this.channels.get(channelId);
      if (!channel || !channel.enabled) return Promise.resolve();

      return this.sendToChannel(channel, message);
    });

    await Promise.allSettled(promises);
  }

  private async sendMessageDirectly(message: NotificationMessage): Promise<void> {
    await this.sendMessageToChannels(message);
  }

  private async sendToChannel(channel: NotificationChannel, message: NotificationMessage): Promise<void> {
    try {
      switch (channel.type) {
        case 'console':
          this.sendToConsole(message);
          break;
        case 'telegram':
          await this.sendToTelegram(channel, message);
          break;
        case 'discord':
          await this.sendToDiscord(channel, message);
          break;
        case 'email':
          await this.sendToEmail(channel, message);
          break;
        case 'webhook':
          await this.sendToWebhook(channel, message);
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to send to ${channel.type} channel:`, error);
    }
  }

  private sendToConsole(message: NotificationMessage): void {
    const timestamp = message.timestamp.toISOString();
    const priorityEmoji = {
      low: '💬',
      medium: '📢',
      high: '⚠️',
      critical: '🚨'
    }[message.priority];

    console.log(`\n${priorityEmoji} [${timestamp}] ${message.title}`);
    console.log(message.message);
    
    if (message.data && message.type === 'opportunity') {
      const opp = message.data as ArbitrageOpportunity;
      console.log(`   Profit: ${opp.profitPercent.toFixed(4)}% | Volume: ${opp.volume.toFixed(2)} | Type: ${opp.type}`);
    }
    console.log('');
  }

  private async sendToTelegram(channel: NotificationChannel, message: NotificationMessage): Promise<void> {
    const { botToken, chatId } = channel.config;
    
    // Format message for Telegram (Markdown)
    const telegramMessage = `*${message.title}*\n\n${message.message}`;
    
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    await axios.post(url, {
      chat_id: chatId,
      text: telegramMessage,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }

  private async sendToDiscord(channel: NotificationChannel, message: NotificationMessage): Promise<void> {
    const { webhookUrl } = channel.config;
    
    const color = {
      low: 0x3498db,      // Blue
      medium: 0xf39c12,   // Orange
      high: 0xe74c3c,     // Red
      critical: 0x8e44ad  // Purple
    }[message.priority];

    const embed: any = {
      title: message.title,
      description: message.message,
      color,
      timestamp: message.timestamp.toISOString(),
      footer: {
        text: 'Matreshka Arbitrage System'
      }
    };

    // Add fields for opportunity data
    if (message.type === 'opportunity' && message.data) {
      const opp = message.data as ArbitrageOpportunity;
      embed.fields = [
        { name: 'Profit', value: `${opp.profitPercent.toFixed(4)}%`, inline: true },
        { name: 'Volume', value: opp.volume.toFixed(2), inline: true },
        { name: 'Type', value: opp.type, inline: true }
      ];
    }

    await axios.post(webhookUrl, {
      embeds: [embed]
    });
  }

  private async sendToEmail(channel: NotificationChannel, message: NotificationMessage): Promise<void> {
    // Email implementation would go here
    // For demo, just log
    this.logger.info(`📧 Email notification: ${message.title}`);
  }

  private async sendToWebhook(channel: NotificationChannel, message: NotificationMessage): Promise<void> {
    const { url } = channel.config;
    
    await axios.post(url, {
      timestamp: message.timestamp,
      type: message.type,
      priority: message.priority,
      title: message.title,
      message: message.message,
      data: message.data
    });
  }

  private determineOpportunityPriority(opportunity: ArbitrageOpportunity): 'low' | 'medium' | 'high' | 'critical' {
    if (opportunity.profitPercent > 5) return 'critical';
    if (opportunity.profitPercent > 2) return 'high';
    if (opportunity.profitPercent > 0.5) return 'medium';
    return 'low';
  }

  private getChannelsForPriority(priority: 'low' | 'medium' | 'high' | 'critical'): string[] {
    const channels: string[] = [];

    for (const [id, channel] of this.channels) {
      if (!channel.enabled) continue;

      const priorities = { low: 1, medium: 2, high: 3, critical: 4 };
      const channelPriority = priorities[channel.priority];
      const messagePriority = priorities[priority];

      if (messagePriority >= channelPriority) {
        channels.push(id);
      }
    }

    return channels;
  }

  private formatOpportunityMessage(opportunity: ArbitrageOpportunity): string {
    const paths = opportunity.paths.map(path => 
      `${path.exchange}: ${path.side.toUpperCase()} ${path.amount.toFixed(4)} ${path.symbol} @ $${path.price.toFixed(2)}`
    ).join('\n');

    return `**Profit:** ${opportunity.profitPercent.toFixed(4)}% ($${opportunity.profit.toFixed(2)})\n` +
           `**Volume:** ${opportunity.volume.toFixed(2)}\n` +
           `**Type:** ${opportunity.type}\n` +
           `**Confidence:** ${(opportunity.confidence * 100).toFixed(1)}%\n\n` +
           `**Execution Plan:**\n${paths}\n\n` +
           `**Estimated Duration:** ${opportunity.estimatedDuration}s`;
  }

  private formatExecutionMessage(execution: ArbitrageExecution, status: string): string {
    let message = `**Opportunity ID:** ${execution.opportunityId}\n` +
                  `**Status:** ${status.toUpperCase()}\n`;

    if (status === 'completed') {
      message += `**Total Profit:** $${execution.totalProfit.toFixed(2)}\n` +
                 `**Execution Time:** ${execution.executionTime || 'N/A'}ms\n`;
    }

    if (execution.errors && execution.errors.length > 0) {
      message += `**Errors:** ${execution.errors.join(', ')}\n`;
    }

    return message;
  }

  private formatPatternMessage(patterns: any[]): string {
    const patternSummary = patterns.map(p => 
      `• **${p.type.toUpperCase()}** (${(p.strength * 100).toFixed(1)}% strength) - ${p.assets.join(', ')}`
    ).join('\n');

    return `**Strong patterns detected:**\n\n${patternSummary}\n\n` +
           `*These patterns may indicate upcoming market opportunities.*`;
  }

  private checkRateLimit(message: NotificationMessage): boolean {
    const key = `${message.type}_${message.priority}`;
    const now = Date.now();
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, { count: 0, resetTime: now + this.RATE_LIMIT_WINDOW });
    }

    const rateLimit = this.rateLimits.get(key)!;
    
    // Reset if window expired
    if (now > rateLimit.resetTime) {
      rateLimit.count = 0;
      rateLimit.resetTime = now + this.RATE_LIMIT_WINDOW;
    }

    // Check limit
    if (rateLimit.count >= this.MAX_MESSAGES_PER_MINUTE) {
      return false;
    }

    rateLimit.count++;
    return true;
  }

  // Public methods for configuration
  public enableChannel(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.enabled = true;
      this.logger.info(`✅ Enabled notification channel: ${channelId}`);
    }
  }

  public disableChannel(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.enabled = false;
      this.logger.info(`❌ Disabled notification channel: ${channelId}`);
    }
  }

  public getChannelStatus(): Record<string, { enabled: boolean; type: string; priority: string }> {
    const status: Record<string, { enabled: boolean; type: string; priority: string }> = {};
    
    for (const [id, channel] of this.channels) {
      status[id] = {
        enabled: channel.enabled,
        type: channel.type,
        priority: channel.priority
      };
    }
    
    return status;
  }

  public getQueueSize(): number {
    return this.messageQueue.length;
  }
}
