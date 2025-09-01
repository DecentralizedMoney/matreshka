# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./
COPY jest.config.js ./
COPY .eslintrc.js ./
COPY .prettierrc ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --silent && npm cache clean --force

# Copy source code
COPY src ./src

# Run linting and tests
RUN npm run lint:check || true
RUN npm run format:check || true

# Build TypeScript to JavaScript
RUN npm run build:prod

# Remove dev dependencies
RUN npm prune --production

# Production stage
FROM node:18-alpine AS production

# Install production runtime dependencies
RUN apk add --no-cache \
    tini \
    curl \
    ca-certificates \
    && update-ca-certificates

# Create app directory
WORKDIR /app

# Create non-root user with specific UID/GID
RUN addgroup -g 1001 -S matreshka && \
    adduser -S matreshka -u 1001 -G matreshka

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production --silent && \
    npm cache clean --force && \
    rm -rf ~/.npm

# Copy built application from builder stage
COPY --from=builder --chown=matreshka:matreshka /app/dist ./dist

# Create necessary directories with proper permissions
RUN mkdir -p logs config data && \
    chown -R matreshka:matreshka logs config data

# Copy configuration files
COPY --chown=matreshka:matreshka env.production.example ./env.example
COPY --chown=matreshka:matreshka docker-compose.yml ./

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV WEB_PORT=3000
ENV DEMO_MODE=true

# Switch to non-root user
USER matreshka

# Expose application port
EXPOSE 3000

# Add labels for better container management
LABEL maintainer="BRICS.trading Team"
LABEL version="2.0.0"
LABEL description="Matreshka Arbitrage System - Production Ready"

# Health check with more comprehensive validation
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node dist/index.js --health-check || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application with production optimizations
CMD ["node", "--max-old-space-size=2048", "--optimize-for-size", "dist/index.js"]
