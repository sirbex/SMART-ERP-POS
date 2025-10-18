# Script to create all backend source files
Write-Host "Creating all backend source files..." -ForegroundColor Cyan

# Change to server directory
Set-Location "C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server"

# ============================================================================
# 1. DATABASE CONFIG
# ============================================================================
Write-Host "Creating src/config/database.ts..." -ForegroundColor Yellow
@'
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Log queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query' as never, (e: any) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

prisma.$on('error' as never, (e: any) => {
  logger.error('Prisma Error:', e);
});

prisma.$on('warn' as never, (e: any) => {
  logger.warn('Prisma Warning:', e);
});

// Test database connection
prisma.$connect()
  .then(() => logger.info('✅ Database connected successfully'))
  .catch((error) => {
    logger.error('❌ Database connection failed:', error);
    process.exit(1);
  });
'@ | Out-File -FilePath "src/config/database.ts" -Encoding UTF8

Write-Host "✅ src/config/database.ts created" -ForegroundColor Green
Write-Host ""
