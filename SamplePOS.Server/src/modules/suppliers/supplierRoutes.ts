// Supplier Routes - Route definitions only
// Maps HTTP endpoints to controllers

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import {
  getSuppliers,
  getSupplier,
  getSupplierByNumber,
  searchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierPerformance,
  getSupplierOrders,
  getSupplierProducts,
  getSupplierLedger,
} from './supplierController.js';

const router = Router();

// View routes - authenticated users
router.get('/', authenticate, getSuppliers);
router.get('/search', authenticate, searchSuppliers);
router.get('/by-number/:supplierNumber', authenticate, getSupplierByNumber);
router.get('/:id', authenticate, getSupplier);
router.get('/:id/performance', authenticate, getSupplierPerformance);
router.get('/:id/orders', authenticate, getSupplierOrders);
router.get('/:id/products', authenticate, getSupplierProducts);
router.get('/:id/ledger', authenticate, getSupplierLedger);

// Modify routes - requires supplier permissions
router.post('/', authenticate, requirePermission('suppliers.create'), createSupplier);
router.put('/:id', authenticate, requirePermission('suppliers.update'), updateSupplier);
router.delete('/:id', authenticate, requirePermission('suppliers.delete'), deleteSupplier);

export const supplierRoutes = router;
