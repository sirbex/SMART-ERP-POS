// Products Routes
// Defines API endpoints for products module

import { Router } from 'express';
import * as productController from './productController.js';
import { getProductHistory } from './productHistoryController.js';
import * as uomController from './uomController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

const router = Router();

// All routes require authentication
// List products - any authenticated user
router.get('/', authenticate, productController.getProducts);

// Procurement search - must be before :id to avoid being captured
router.get('/procurement-search', authenticate, productController.procurementSearch);

router.get('/:id', authenticate, productController.getProduct);
router.post('/:id/convert-quantity', authenticate, productController.convertProductQuantity);
router.get('/:id/history', authenticate, getProductHistory);

// Supplier price tracking: get all supplier prices for a product
router.get('/:id/supplier-prices', authenticate, productController.getProductSupplierPrices);

// UoM endpoints
router.get('/uoms/master', authenticate, uomController.listUoms);
router.post('/uoms/master', authenticate, requirePermission('inventory.create'), uomController.createUom);
router.patch('/uoms/master/:uomId', authenticate, requirePermission('inventory.update'), uomController.updateUom);
router.delete('/uoms/master/:uomId', authenticate, requirePermission('inventory.delete'), uomController.deleteUom);
router.get('/:id/uoms', authenticate, uomController.getProductUoms);
router.post('/:id/uoms', authenticate, requirePermission('inventory.create'), uomController.addProductUom);
router.patch(
  '/:id/uoms/:productUomId',
  authenticate,
  requirePermission('inventory.update'),
  uomController.updateProductUom
);
router.delete(
  '/:id/uoms/:productUomId',
  authenticate,
  requirePermission('inventory.delete'),
  uomController.deleteProductUom
);

// Create/Update/Delete - requires inventory permissions
router.post('/', authenticate, requirePermission('inventory.create'), productController.createProduct);
router.put('/:id', authenticate, requirePermission('inventory.update'), productController.updateProduct);
router.delete('/:id', authenticate, requirePermission('inventory.delete'), productController.deleteProduct);

export const productRoutes = router;
