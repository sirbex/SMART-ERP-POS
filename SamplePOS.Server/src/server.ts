import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
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
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import prisma from './config/database.js';
import apiLimiter, { authLimiter } from './middleware/rateLimit.js';

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

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use(errorHandler);

// ============================================================================
// SERVER START
// ============================================================================

const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});



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

