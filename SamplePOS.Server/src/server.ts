// Main Express Server
// SamplePOS Backend API

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { testConnection } from './db/pool.js';
import logger from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { businessRuleErrorHandler } from './middleware/businessRules.js';
import { globalRateLimit, authRateLimit } from './middleware/security.js';
import { productRoutes } from './modules/products/productRoutes.js';
import { customerRoutes } from './modules/customers/customerRoutes.js';
import { supplierRoutes } from './modules/suppliers/supplierRoutes.js';
import { authRoutes } from './modules/auth/authRoutes.js';
import { salesRoutes } from './modules/sales/salesRoutes.js';
import { inventoryRoutes } from './modules/inventory/inventoryRoutes.js';
import { purchaseOrderRoutes } from './modules/purchase-orders/purchaseOrderRoutes.js';
import { goodsReceiptRoutes } from './modules/goods-receipts/goodsReceiptRoutes.js';
import { stockMovementRoutes } from './modules/stock-movements/stockMovementRoutes.js';
import { invoiceRoutes } from './modules/invoices/invoiceRoutes.js';
import { invoiceSettingsRoutes } from './modules/settings/invoiceSettingsRoutes.js';
import { systemSettingsRoutes } from './modules/system-settings/systemSettingsRoutes.js';
import { createReportsRouter } from './modules/reports/reportsRoutes.js';
import { createUserRoutes } from './modules/users/userRoutes.js';
import { adminRoutes } from './modules/admin/adminRoutes.js';
import { systemManagementRoutes } from './modules/system-management/systemManagementRoutes.js';
import { discountRoutes } from './modules/discounts/discountRoutes.js';
import { createPaymentsRoutes } from './modules/payments/paymentsRoutes.js';
import auditRoutes from './modules/audit/auditRoutes.js';
import { createHoldRoutes } from './modules/pos/holdRoutes.js';
import { createOfflineSyncRoutes } from './modules/pos/offlineSyncRoutes.js';
import quotationRoutes from './modules/quotations/quotationRoutes.js';
import deliveryRoutes from './modules/delivery/deliveryRoutes.js';
import { accountingRoutes } from './modules/accounting/accountingRoutes.js';
import depositsRoutes from './modules/deposits/depositsRoutes.js';
import { comprehensiveAccountingRoutes } from './modules/accounting/comprehensiveAccountingRoutes.js';
import integrityRoutes from './modules/accounting/integrityRoutes.js';
import documentRoutes from './modules/documents/documentController.js';
import expenseRoutes from './routes/expenseRoutes.js';
import erpAccountingRoutes from './routes/erpAccountingRoutes.js';
import bankingRoutes from './routes/bankingRoutes.js';
import { createSupplierPaymentRoutes } from './modules/supplier-payments/supplierPaymentRoutes.js';
import { cashRegisterRoutes } from './modules/cash-register/index.js';
import pool from './db/pool.js';
import { auditContextMiddleware } from './middleware/auditContext.js';
import { createRbacRoutes, initializeRbacMiddleware } from './rbac/index.js';
import { platformRoutes } from './modules/platform/platformRoutes.js';
import { syncRoutes } from './modules/platform/syncRoutes.js';
import { tenantMiddleware } from './middleware/tenantMiddleware.js';
import { connectionManager } from './db/connectionManager.js';
import { authenticate } from './middleware/auth.js';
import { correlationId } from './middleware/correlationId.js';
import { initDemandForecastJobs } from './modules/reports/demandForecastJobs.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

// All modules now use consistent named exports for maintainability

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ============================================================
// SENTRY ERROR MONITORING (must init before other middleware)
// ============================================================
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  logger.info('Sentry error monitoring initialized');
}

// ============================================================
// MIDDLEWARE
// ============================================================

// Make pool available to routes via app.get('pool')
app.set('pool', pool);

// Initialize RBAC middleware with database pool
initializeRbacMiddleware(pool);

// Security headers
app.use(helmet());

// Rate limiting (must be early to block floods before heavy middleware)
app.use(globalRateLimit);
app.use('/api/auth', authRateLimit);

// Correlation ID for request tracing
app.use(correlationId);

// CORS - Allow both localhost and 127.0.0.1
const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// Request logging
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.path}`, { requestId: req.requestId });
  next();
});

// Audit context middleware (adds audit context to all requests)
// Should be after auth middleware to get user info
app.use(auditContextMiddleware);

// Multi-tenant middleware (resolves tenant from JWT/header/subdomain → attaches pool)
app.use(tenantMiddleware);

// ============================================================
// ROUTES
// ============================================================

// Health check - single fast query, no retries (unlike testConnection used at startup)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'healthy',
        server: 'healthy'
      }
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: (error instanceof Error ? error.message : String(error)),
      services: {
        database: 'unhealthy'
      }
    });
  }
});

// API Documentation (Swagger UI)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'SMART-ERP-POS API Docs',
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// API routes

// Platform routes (super admin — tenant management, no tenant middleware needed)
app.use('/api/platform', platformRoutes);

// Sync routes (edge node ↔ cloud synchronization)
app.use('/api/sync', syncRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/accounting', accountingRoutes);  // Move accounting routes early to avoid interference
app.use('/api/accounting/comprehensive', comprehensiveAccountingRoutes);  // Comprehensive accounting features
app.use('/api/accounting/integrity', authenticate, integrityRoutes);  // Accounting integrity checks
app.use('/api/erp-accounting', erpAccountingRoutes);  // ERP-grade financial reporting and controls
app.use('/api/banking', bankingRoutes);  // Banking module - accounts, transactions, reconciliation
app.use('/api/documents', documentRoutes);  // Document management for file uploads
app.use('/api/expenses', expenseRoutes);  // Expense management system
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/goods-receipts', goodsReceiptRoutes);
app.use('/api/stock-movements', stockMovementRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/settings/invoice', invoiceSettingsRoutes);
app.use('/api/system-settings', systemSettingsRoutes);
app.use('/api/reports', createReportsRouter(pool));
app.use('/api/users', createUserRoutes());
app.use('/api/admin', adminRoutes);
app.use('/api/system', systemManagementRoutes);  // ERP-grade backup, reset, restore
app.use('/api/discounts', authenticate, discountRoutes);
app.use('/api/payments', createPaymentsRoutes());
app.use('/api/audit', authenticate, auditRoutes);
app.use('/api/deposits', depositsRoutes);  // Customer deposits management
app.use('/api/pos/hold', createHoldRoutes(pool));
app.use('/api/pos/sync-offline-sales', createOfflineSyncRoutes(pool));  // Offline sales sync
app.use('/api/supplier-payments', createSupplierPaymentRoutes(pool));  // Supplier payments and bills
app.use('/api/cash-registers', cashRegisterRoutes);  // Cash register management
app.use('/api/rbac', createRbacRoutes(pool));  // Role-based access control
app.use('/api', quotationRoutes);
app.use('/api/delivery', deliveryRoutes);
// Accounting routes moved above for better priority


// ============================================================
// ERROR HANDLERS
// ============================================================

// 404 handler for unknown routes (must be after all route definitions)
app.use(notFoundHandler);

// Business rule error handler (catches business logic violations)
app.use(businessRuleErrorHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.error('Failed to connect to database');
      process.exit(1);
    }

    logger.info('Database connection successful');

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('✅ SamplePOS Backend API Started');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 API endpoint: http://localhost:${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`📍 API docs:     http://localhost:${PORT}/api/docs`);
      console.log(`📍 Frontend URL: ${FRONTEND_URL}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📚 Available modules:');
      console.log('   - Auth (/api/auth)');
      console.log('   - Products (/api/products)');
      console.log('   - Customers (/api/customers)');
      console.log('   - Suppliers (/api/suppliers)');
      console.log('   - Sales (/api/sales)');
      console.log('   - Inventory (/api/inventory)');
      console.log('   - Purchase Orders (/api/purchase-orders)');
      console.log('   - Goods Receipts (/api/goods-receipts)');
      console.log('   - Stock Movements (/api/stock-movements)');
      console.log('   - Invoices (/api/invoices)');
      console.log('   - System Settings (/api/system-settings)');
      console.log('   - Reports (/api/reports)');
      console.log('   - Admin (/api/admin)');
      console.log('   - Audit Trail (/api/audit)');
      console.log('   - Quotations (/api/quotations)');
      console.log('   - Expenses (/api/expenses)');
      console.log('   - Supplier Payments (/api/supplier-payments)');
      console.log('   - Banking (/api/banking)');
      console.log('   - RBAC (/api/rbac)');
      console.log('   - Delivery (/api/delivery)');
      console.log('   - Platform (/api/platform)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');

      logger.info(`Server started on port ${PORT}`);

      // Initialize self-learning demand forecast jobs (requires Redis)
      try {
        initDemandForecastJobs(pool);
      } catch (err) {
        logger.warn('Demand forecast jobs not started (Redis may be offline)', { error: err instanceof Error ? err.message : String(err) });
      }
    });

    server.on('error', (error: Error) => {
      logger.error('Server error:', error);
      console.error('Server error:', error);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      console.error('Uncaught exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection:', { reason, promise });
      console.error('Unhandled rejection:', reason);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        await connectionManager.shutdown();
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Export app for testing
export default app;

// Start server only if not imported (i.e., not in test environment)
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
