// Main Express Server
// SamplePOS Backend API

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { testConnection } from './db/pool.js';
import logger from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { businessRuleErrorHandler } from './middleware/businessRules.js';
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
// import deliveryRoutes from './modules/delivery/deliveryRoutes.js'; // Temporarily disabled - SQL syntax errors
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

// All modules now use consistent named exports for maintainability

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ============================================================
// MIDDLEWARE
// ============================================================

// Make pool available to routes via app.get('pool')
app.set('pool', pool);

// Initialize RBAC middleware with database pool
initializeRbacMiddleware(pool);

// Security headers
app.use(helmet());

// CORS - Allow both localhost and 127.0.0.1
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
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
  logger.http(`${req.method} ${req.path}`);
  next();
});

// Audit context middleware (adds audit context to all requests)
// Should be after auth middleware to get user info
app.use(auditContextMiddleware);

// ============================================================
// ROUTES
// ============================================================

// Health check - simple version without accounting integration
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await testConnection();

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'healthy',
        server: 'healthy'
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      services: {
        database: 'unhealthy'
      }
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/accounting', accountingRoutes);  // Move accounting routes early to avoid interference
app.use('/api/accounting/comprehensive', comprehensiveAccountingRoutes);  // Comprehensive accounting features
app.use('/api/accounting/integrity', integrityRoutes);  // Accounting integrity checks
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
app.use('/api/users', createUserRoutes(pool));
app.use('/api/admin', adminRoutes);
app.use('/api/system', systemManagementRoutes);  // ERP-grade backup, reset, restore
app.use('/api/discounts', discountRoutes);
app.use('/api/payments', createPaymentsRoutes(pool));
app.use('/api/audit', auditRoutes);
app.use('/api/deposits', depositsRoutes);  // Customer deposits management
app.use('/api/pos/hold', createHoldRoutes(pool));
app.use('/api/pos/sync-offline-sales', createOfflineSyncRoutes(pool));  // Offline sales sync
app.use('/api/supplier-payments', createSupplierPaymentRoutes(pool));  // Supplier payments and bills
app.use('/api/cash-registers', cashRegisterRoutes);  // Cash register management
app.use('/api/rbac', createRbacRoutes(pool));  // Role-based access control
app.use('/api', quotationRoutes);
// app.use('/api/delivery', deliveryRoutes); // Temporarily disabled - SQL syntax errors  
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
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');

      logger.info(`Server started on port ${PORT}`);
    });

    server.on('error', (error: any) => {
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
