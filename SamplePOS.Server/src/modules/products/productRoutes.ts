// Products Routes
// Defines API endpoints for products module

import { Router } from 'express';
import * as productController from './productController.js';
import { getProductHistory } from './productHistoryController.js';
import * as uomController from './uomController.js';
import { authenticate, authorize } from '../../middleware/auth.js';

const router = Router();

// All routes require authentication
// List products - any authenticated user
router.get('/', authenticate, productController.getProducts);
router.get('/:id', authenticate, productController.getProduct);
router.post('/:id/convert-quantity', authenticate, productController.convertProductQuantity);
router.get('/:id/history', authenticate, getProductHistory);

// UoM endpoints
router.get('/uoms/master', authenticate, uomController.listUoms);
router.post('/uoms/master', authenticate, authorize('ADMIN', 'MANAGER'), uomController.createUom);
router.patch('/uoms/master/:uomId', authenticate, authorize('ADMIN', 'MANAGER'), uomController.updateUom);
router.delete('/uoms/master/:uomId', authenticate, authorize('ADMIN', 'MANAGER'), uomController.deleteUom);
router.get('/:id/uoms', authenticate, uomController.getProductUoms);
router.post('/:id/uoms', authenticate, authorize('ADMIN', 'MANAGER'), uomController.addProductUom);
router.patch(
  '/:id/uoms/:productUomId',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  uomController.updateProductUom
);
router.delete(
  '/:id/uoms/:productUomId',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  uomController.deleteProductUom
);

// Create/Update/Delete - ADMIN and MANAGER only
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), productController.createProduct);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), productController.updateProduct);
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), productController.deleteProduct);

export const productRoutes = router;
