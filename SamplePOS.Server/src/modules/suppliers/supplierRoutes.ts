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
  reactivateSupplier,
  getSupplierPerformance,
  getSupplierOrders,
  getSupplierProducts,
  getSupplierLedger,
  getSmartSupplierStatement,
} from './supplierController.js';

const router = Router();

// View routes
router.get('/', authenticate, requirePermission('suppliers.read'), getSuppliers);
router.get('/search', authenticate, requirePermission('suppliers.read'), searchSuppliers);
router.get('/by-number/:supplierNumber', authenticate, requirePermission('suppliers.read'), getSupplierByNumber);
router.get('/:id', authenticate, requirePermission('suppliers.read'), getSupplier);
router.get('/:id/performance', authenticate, requirePermission('suppliers.read'), getSupplierPerformance);
router.get('/:id/orders', authenticate, requirePermission('suppliers.read'), getSupplierOrders);
router.get('/:id/products', authenticate, requirePermission('suppliers.read'), getSupplierProducts);
router.get('/:id/ledger', authenticate, requirePermission('suppliers.read'), getSupplierLedger);
router.get('/:id/smart-statement', authenticate, requirePermission('suppliers.read'), getSmartSupplierStatement);

// Modify routes - requires supplier permissions
router.post('/', authenticate, requirePermission('suppliers.create'), createSupplier);
router.put('/:id', authenticate, requirePermission('suppliers.update'), updateSupplier);
router.post('/:id/reactivate', authenticate, requirePermission('suppliers.update'), reactivateSupplier);
router.delete('/:id', authenticate, requirePermission('suppliers.delete'), deleteSupplier);

export const supplierRoutes = router;
