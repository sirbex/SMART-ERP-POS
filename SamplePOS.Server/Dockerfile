# Phase 6: Deployment & Infrastructure
# Node.js Backend Dockerfile

FROM node:20-alpine AS base

# Install dumb-init for proper PID 1 signal handling (fast container shutdown)
RUN apk add --no-cache dumb-init

# Install production dependencies only
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Build stage — needs devDependencies for TypeScript compilation
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Production image — lean: only dist + production node_modules
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Create a non-privileged user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy built output and production-only dependencies
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nodejs

EXPOSE 3001

ENV PORT 3001
ENV HOSTNAME "0.0.0.0"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]