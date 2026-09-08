# =======================================================
# 🚀 Multi-stage Dockerfile for TruyenKomi Angular SPA
# =======================================================

# Stage 1: Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Copy package descriptors first to cache npm layers
COPY package*.json ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy frontend source code and build production bundle
COPY . .
RUN npm run build

# Stage 2: Serve stage via Nginx
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Clean default nginx files
RUN rm -rf /usr/share/nginx/html/*

# Cài đặt curl siêu nhẹ cho healthcheck
RUN apk add --no-cache curl

# Copy built artifacts from build stage
COPY --from=build /app/dist/truyenkomi/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
