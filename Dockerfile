# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=frontend
COPY frontend ./frontend
RUN npm run build --workspace=frontend


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy backend deps first (layer cache)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace=backend

# Copy backend source
COPY backend/src/ ./backend/src/

# Copy built frontend
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Expose backend workspace as runtime app root
WORKDIR /app/backend

# Data directory (mount a volume here for persistence)
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3001

# dumb-init handles SIGTERM → graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
