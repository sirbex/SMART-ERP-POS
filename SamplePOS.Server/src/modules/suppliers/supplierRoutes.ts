// Supplier Routes - Route definitions only
// Maps HTTP endpoints to controllers

import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.js';
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

// Modify routes - ADMIN, MANAGER only
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), createSupplier);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), updateSupplier);
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), deleteSupplier);

export const supplierRoutes = router;
