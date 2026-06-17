# Stage 1: install deps (needs build tools for native modules like bcrypt, sharp)
FROM node:20-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

# Tell puppeteer and playwright to skip downloading their own browser binaries
# — the system chromium package is used instead (via PUPPETEER_EXECUTABLE_PATH)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: production image
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    unzip \
    wget \
    dumb-init \
    docker-cli \
    postgresql-client \
    chromium

WORKDIR /app

# Copy only production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Create directories and set permissions
# /app/uploads and /app/backups must exist in the image so Docker initializes
# their named volumes with nodeuser ownership (non-root server can't write a
# root-owned bind mount)
RUN mkdir -p /tmp/itsnotes-import /app/uploads /app/backups && \
    chown -R nodeuser:nodejs /app /tmp/itsnotes-import

# Switch to non-root user
USER nodeuser

# Environment variables
ENV NODE_ENV=production
ARG SERVER_PORT=5000
ENV SERVER_PORT=$SERVER_PORT

# Expose port
EXPOSE $SERVER_PORT

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${SERVER_PORT}/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["npm", "start"]