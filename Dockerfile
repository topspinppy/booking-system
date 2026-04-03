# ──────────────────────────────────────────────
# Stage 1: Base
# ──────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ──────────────────────────────────────────────
# Stage 2: Development
# ──────────────────────────────────────────────
FROM base AS development
RUN npm ci
COPY . .
CMD ["npm", "run", "start:dev"]

# ──────────────────────────────────────────────
# Stage 3: Build
# ──────────────────────────────────────────────
FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

# ──────────────────────────────────────────────
# Stage 4: Production
# ──────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

USER nestjs
EXPOSE 3000
CMD ["node", "dist/main"]
