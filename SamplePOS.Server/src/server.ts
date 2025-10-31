import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import crypto from 'crypto';
import authRouter from './modules/auth.js';
import usersRouter from './modules/users.js';
import customersRouter from './modules/customers.js';
import customerAccountsRouter from './modules/customerAccounts.js';
import productsRouter from './modules/products.js';
import installmentsRouter from './modules/installments.js';
import paymentsRouter from './modules/payments.js';
import salesRouter from './modules/sales.js';
import inventoryRouter from './modules/inventory.js';
import documentsRouter from './modules/documents.js';
import settingsRouter from './modules/settings.js';
import suppliersRouter from './modules/suppliers.js';
import purchaseOrdersRouter from './modules/purchaseOrders.js';
import goodsReceiptsRouter from './modules/goodsReceipts.js';
import inventoryBatchesRouter from './modules/inventoryBatches.js';
import stockMovementsRouter from './modules/stockMovements.js';
import customerGroupsRouter from './modules/customerGroups.js';
import pricingTiersRouter from './modules/pricingTiers.js';
import priceQuotesRouter from './modules/priceQuotes.js';
import batchPricingRouter from './modules/batchPricing.js';
import uomRouter from './modules/uom.js';
import heldSalesRouter from './routes/heldSales.js';
import adminRouter from './modules/admin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getHealthStatus, getLiveness, getReadiness } from './services/healthService.js';
import { closeQueues } from './config/queue.js';
import logger from './utils/logger.js';
import prisma from './config/database.js';
import apiLimiter, { authLimiter } from './middleware/rateLimit.js';
import { connectRedis, disconnectRedis } from './config/redis.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (apply before routes)
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// Request logging with timing, correlation IDs, and slow query detection
app.use((req, res, next) => {
  const start = Date.now();
  
  // Generate correlation ID for request tracking
  const correlationId = crypto.randomUUID();
  (req as any).correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Extract userId from JWT if authenticated (set by authenticate middleware later)
  const userId = (req as any).user?.id || null;
  
  // Log request start with correlation ID
  logger.info(`→ ${req.method} ${req.path}`, {
    correlationId,
    userId,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      correlationId,
      userId,
      status: res.statusCode,
      duration,
      ip: req.ip,
      method: req.method,
      path: req.path
    };
    
    // Warn on slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn(`⚠️ Slow request: ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, logData);
    } else {
      logger.info(`← ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, logData);
    }
  });
  
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Health check endpoints (both paths for compatibility)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount all module routers
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/customer-accounts', customerAccountsRouter);
app.use('/api/products', productsRouter);
app.use('/api/installments', installmentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/suppliers', suppliersRouter);

// Purchase Receiving System
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/goods-receipts', goodsReceiptsRouter);
app.use('/api/inventory/batches', inventoryBatchesRouter);
app.use('/api/stock-movements', stockMovementsRouter);

// Pricing & Costing System
app.use('/api/customer-groups', customerGroupsRouter);
app.use('/api/pricing-tiers', pricingTiersRouter);
app.use('/api/pricing', priceQuotesRouter);
app.use('/api/batch-pricing', batchPricingRouter);

// Unit of Measure (UoM) System
app.use('/api/uoms', uomRouter);

// POS Features (Held Sales)
app.use('/api/pos', heldSalesRouter);

// Admin Dashboard (Bull Board for job monitoring)
app.use('/admin', adminRouter);
// ============================================================================
// HEALTH CHECKS
// ============================================================================

// Kubernetes/Docker liveness probe (is process running?)
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Kubernetes/Docker readiness probe (ready to serve traffic?)
app.get('/health/ready', async (req, res) => {
  const ready = await getReadiness();
  if (ready) {
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ status: 'not ready', timestamp: new Date().toISOString() });
  }
});

// Detailed health check (for monitoring dashboards)
app.get('/health', async (req, res) => {
  const health = await getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});


// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use(errorHandler);

// ============================================================================
// SERVER START
// ============================================================================

const server = app.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Connect to Redis (non-blocking - app works without it)
  await connectRedis();
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  // Stop accepting new requests
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Close job queues
      logger.info('Closing job queues...');
      await closeQueues();
      logger.info('Job queues closed');
      
      // Disconnect from Redis
      logger.info('Disconnecting from Redis...');
      await disconnectRedis();
      logger.info('Redis disconnected');
      
      // Disconnect from database
      logger.info('Disconnecting from database...');
      await prisma.$disconnect();
      logger.info('Database disconnected');
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));



// Global error handlers
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

