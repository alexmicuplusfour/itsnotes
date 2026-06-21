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
    su-exec \
    docker-cli \
    postgresql-client \
    chromium

WORKDIR /app

# Create user for security (before copying so files land with correct ownership)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Copy only production node_modules from deps stage, owned by nodeuser
COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Copy application code, owned by nodeuser
COPY --chown=nodeuser:nodejs . .

# Create directories owned by nodeuser
# /app/uploads and /app/backups must exist in the image so Docker initializes
# their named volumes with nodeuser ownership (non-root server can't write a
# root-owned bind mount). /data/notes-mirror (the default Markdown Mirror target)
# is included so a named-volume mount inherits nodeuser ownership too; a bind
# mount is fixed up at runtime by docker-entrypoint.sh.
RUN mkdir -p /tmp/itsnotes-import /app/uploads /app/backups /data/notes-mirror && \
    chown nodeuser:nodejs /tmp/itsnotes-import /app/uploads /app/backups /data/notes-mirror

# Ownership-fixing launcher: starts as root, chowns the (possibly bind-mounted)
# data dirs, then drops to nodeuser via su-exec to run the app. We intentionally
# do NOT `USER nodeuser` here — the entrypoint needs root to chown, and the app
# itself still ends up running as nodeuser.
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment variables
ENV NODE_ENV=production
ARG SERVER_PORT=5000
ENV SERVER_PORT=$SERVER_PORT

# Expose port
EXPOSE $SERVER_PORT

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${SERVER_PORT}/api/health || exit 1

# dumb-init is PID 1 for clean signal handling; it runs our entrypoint, which fixes
# data-dir ownership as root and then drops to nodeuser to exec the CMD below.
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]

# Start the server
CMD ["npm", "start"]