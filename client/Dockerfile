# Multi-stage build for React client
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Build stamp injected by CI (date + per-day count, e.g. 2026-06-26.03)
ARG VITE_BUILD_ID=dev
ENV VITE_BUILD_ID=$VITE_BUILD_ID

# Copy source code
COPY . .

# Build the application for production (without console logs)
RUN npm run build:prod

# Production stage with Nginx
FROM nginx:alpine

# Install envsubst for dynamic configuration
RUN apk add --no-cache gettext

# Copy built application
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Create startup script to substitute environment variables
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'cp /etc/nginx/conf.d/default.conf.template /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Expose port
EXPOSE 80

# Start nginx with environment variable substitution
CMD ["/docker-entrypoint.sh"]