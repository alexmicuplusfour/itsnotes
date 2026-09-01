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

# Build with a sentinel base path. The entrypoint substitutes the real
# BASE_PATH at container start, so the same image serves root and subpath
# deployments (see docker-entrypoint.sh).
ENV VITE_BASE_PATH=/__ITSNOTES_BASE__/
RUN npm run build:prod

# Production stage with Nginx
FROM nginx:alpine

# Install envsubst for dynamic configuration
RUN apk add --no-cache gettext

# Copy built application
COPY --from=build /app/dist /usr/share/nginx/html

# Keep pristine copies of every file that embeds the base-path sentinel
# (index.html plus the main JS/CSS bundles). The entrypoint rewrites these
# into place on each start, so BASE_PATH can change without a rebuild.
RUN mkdir -p /usr/share/nginx/templates && \
    cd /usr/share/nginx/html && \
    find . -type f ! -name '*.map' -exec grep -l '__ITSNOTES_BASE__' {} + | \
    while read -r f; do cp "$f" "/usr/share/nginx/templates/$(basename "$f")"; done && \
    ls /usr/share/nginx/templates

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Startup script: substitutes BASE_PATH into the templated files, then runs nginx
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Add health check (127.0.0.1: nginx only listens on IPv4, and alpine
# resolves localhost to ::1 first)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

# Expose port
EXPOSE 80

# Start nginx with environment variable substitution
CMD ["/docker-entrypoint.sh"]
