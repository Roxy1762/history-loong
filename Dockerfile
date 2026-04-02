# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package.json ./
RUN npm install --frozen-lockfile
COPY frontend/ ./
RUN npm run build


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy backend deps first (layer cache)
COPY backend/package.json ./
RUN npm install --omit=dev --frozen-lockfile

# Copy backend source
COPY backend/src/ ./src/

# Copy built frontend
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Data directory (mount a volume here for persistence)
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3001

# dumb-init handles SIGTERM → graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
