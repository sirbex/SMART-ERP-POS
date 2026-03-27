# Phase 6: Deployment & Infrastructure
# Node.js Backend Dockerfile

FROM node:22-alpine AS base

# Install dumb-init for proper PID 1 signal handling (fast container shutdown)
RUN apk add --no-cache dumb-init

# Install production dependencies only
FROM base AS deps
WORKDIR /app
COPY SamplePOS.Server/package.json SamplePOS.Server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Build stage — needs devDependencies for TypeScript compilation
FROM base AS builder
WORKDIR /app
COPY SamplePOS.Server/package.json SamplePOS.Server/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY SamplePOS.Server/ .
# Place shared/ at ../shared/ relative to /app (i.e. at root /shared/)
# so tsconfig's "../shared/**/*" resolves correctly
COPY shared/ /shared/
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

# Symlink entry point so 'node dist/server.js' still works
# tsc outputs to dist/app/src/ when shared/ is included from outside the project
RUN ln -sf dist/app/src/server.js dist/server.js 2>/dev/null || true

USER nodejs

EXPOSE 3001

ENV PORT 3001
ENV HOSTNAME "0.0.0.0"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/app/src/server.js"]