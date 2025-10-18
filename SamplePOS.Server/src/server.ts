import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import authRouter from './modules/auth.js';
import usersRouter from './modules/users.js';
import productsRouter from './modules/products.js';
import salesRouter from './modules/sales.js';
import customersRouter from './modules/customers.js';
import customerAccountsRouter from './modules/customerAccounts.js';
import installmentsRouter from './modules/installments.js';
import paymentsRouter from './modules/payments.js';
import suppliersRouter from './modules/suppliers.js';
import purchasesRouter from './modules/purchases.js';
import inventoryRouter from './modules/inventory.js';
import documentsRouter from './modules/documents.js';
import reportsRouter from './modules/reports.js';
import settingsRouter from './modules/settings.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import prisma from './config/database.js';

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

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Mount all module routers
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/customer-accounts', customerAccountsRouter);
app.use('/api/installments', installmentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);

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

