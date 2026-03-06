import express from 'express';
import axios, { AxiosError } from 'axios';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = express.Router();

// C# Accounting API configuration
const ACCOUNTING_API_BASE_URL = process.env.ACCOUNTING_API_BASE_URL || 'http://localhost:5062';
const ACCOUNTING_API_KEY = process.env.ACCOUNTING_API_KEY || 'your_shared_secret_key_here';

// Utility function to proxy requests to C# Accounting API
async function proxyToAccountingAPI(req: express.Request, res: express.Response, endpoint: string) {
  try {
    const method = req.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
    const url = `${ACCOUNTING_API_BASE_URL}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': ACCOUNTING_API_KEY
    };

    logger.info(`Proxying ${method.toUpperCase()} request to: ${url}`);

    const axiosConfig: Record<string, unknown> = {
      method,
      url,
      headers,
      timeout: 30000,
      params: req.query
    };

    // Add request body for POST/PUT/PATCH requests
    if (['post', 'put', 'patch'].includes(method) && req.body) {
      axiosConfig.data = req.body;
    }

    const response = await axios(axiosConfig);
    res.json(response.data);

  } catch (error: unknown) {
    const axiosErr = error instanceof AxiosError ? error : null;
    logger.error('Error proxying to accounting API:', axiosErr?.response?.data || (error instanceof Error ? error.message : String(error)));

    if (axiosErr?.response) {
      res.status(axiosErr.response.status).json(axiosErr.response.data);
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to connect to accounting service'
      });
    }
  }
}

// Apply authentication to all routes
router.use(authenticate);

// ============================================================
// INVOICE MANAGEMENT ROUTES
// ============================================================

// Get all customer invoices
router.get('/invoices', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/invoices');
}));

// Get invoice by ID
router.get('/invoices/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/invoices/${req.params.id}`);
}));

// Create new invoice
router.post('/invoices', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/invoices');
}));

// Update invoice
router.put('/invoices/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/invoices/${req.params.id}`);
}));

// Void invoice
router.patch('/invoices/:id/void', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/invoices/${req.params.id}/void`);
}));

// Get customer aging report
router.get('/customer-aging', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/reports/customer-aging');
}));

// ============================================================
// CUSTOMER PAYMENT ROUTES
// ============================================================

// Get all customer payments
router.get('/customer-payments', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/customer-payments');
}));

// Get unallocated customer payments (MUST be before :id route)
router.get('/customer-payments/unallocated', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/customer-payments/unallocated');
}));

// Get customer payment by ID
router.get('/customer-payments/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/customer-payments/${req.params.id}`);
}));

// Create new customer payment
router.post('/customer-payments', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/customer-payments');
}));

// Update customer payment
router.put('/customer-payments/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/customer-payments/${req.params.id}`);
}));

// Delete customer payment
router.delete('/customer-payments/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/customer-payments/${req.params.id}`);
}));

// Get customer payment allocations
router.get('/customer-payments/:id/allocations', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/customer-payments/${req.params.id}/allocations`);
}));

// Auto-allocate payment to invoices
router.post('/customer-payments/:id/auto-allocate', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/customer-payments/${req.params.id}/auto-allocate`);
}));

// ============================================================
// PAYMENT ALLOCATION ROUTES
// ============================================================

// Create payment allocation
router.post('/payment-allocations', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/payment-allocations');
}));

// Update payment allocation
router.put('/payment-allocations/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/payment-allocations/${req.params.id}`);
}));

// Delete payment allocation
router.delete('/payment-allocations/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/payment-allocations/${req.params.id}`);
}));

// ============================================================
// SUPPLIER MANAGEMENT ROUTES  
// ============================================================

// Get all suppliers
router.get('/suppliers', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/suppliers');
}));

// Get supplier by ID
router.get('/suppliers/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/suppliers/${req.params.id}`);
}));

// Create new supplier
router.post('/suppliers', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/suppliers');
}));

// Update supplier
router.put('/suppliers/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/suppliers/${req.params.id}`);
}));

// ============================================================
// SUPPLIER INVOICE ROUTES
// ============================================================

// Get all supplier invoices
router.get('/supplier-invoices', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/supplier-invoices');
}));

// Get supplier invoice by ID
router.get('/supplier-invoices/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-invoices/${req.params.id}`);
}));

// Create new supplier invoice
router.post('/supplier-invoices', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/supplier-invoices');
}));

// Update supplier invoice
router.put('/supplier-invoices/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-invoices/${req.params.id}`);
}));

// Delete supplier invoice
router.delete('/supplier-invoices/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-invoices/${req.params.id}`);
}));

// ============================================================
// SUPPLIER PAYMENT ROUTES
// ============================================================

// Get all supplier payments
router.get('/supplier-payments', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/supplier-payments');
}));

// Get supplier payment by ID
router.get('/supplier-payments/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-payments/${req.params.id}`);
}));

// Create new supplier payment
router.post('/supplier-payments', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/supplier-payments');
}));

// Update supplier payment
router.put('/supplier-payments/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-payments/${req.params.id}`);
}));

// Delete supplier payment
router.delete('/supplier-payments/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-payments/${req.params.id}`);
}));

// ============================================================
// SUPPLIER PAYMENT ALLOCATION ROUTES
// ============================================================

// Get supplier payment allocations
router.get('/supplier-payments/:id/allocations', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-payments/${req.params.id}/allocations`);
}));

// Create supplier payment allocation
router.post('/supplier-payment-allocations', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/supplier-payment-allocations');
}));

// Update supplier payment allocation
router.put('/supplier-payment-allocations/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-payment-allocations/${req.params.id}`);
}));

// Delete supplier payment allocation
router.delete('/supplier-payment-allocations/:id', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, `/api/supplier-payment-allocations/${req.params.id}`);
}));

// ============================================================
// REPORTING ROUTES
// ============================================================

// Get supplier aging report
router.get('/supplier-aging', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/reports/supplier-aging');
}));

// Get accounts receivable summary
router.get('/accounts-receivable', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/reports/accounts-receivable');
}));

// Get accounts payable summary
router.get('/accounts-payable', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/reports/accounts-payable');
}));

// Get cash flow report
router.get('/cash-flow', asyncHandler(async (req, res) => {
  await proxyToAccountingAPI(req, res, '/api/reports/cash-flow');
}));

export { router as comprehensiveAccountingRoutes };