// Stock Movement Routes
// Route definitions for stock movement operations

import { Router } from 'express';
import * as stockMovementController from './stockMovementController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

export const stockMovementRoutes = Router();

// Get all movements with optional filters
stockMovementRoutes.get('/', authenticate, requirePermission('inventory.read'), stockMovementController.getAllMovements);

// Get movements by product
stockMovementRoutes.get(
  '/product/:productId',
  authenticate,
  requirePermission('inventory.read'),
  stockMovementController.getMovementsByProduct
);

// Get movements by batch
stockMovementRoutes.get(
  '/batch/:batchId',
  authenticate,
  requirePermission('inventory.read'),
  stockMovementController.getMovementsByBatch
);

// Record manual movement (requires inventory.create permission)
stockMovementRoutes.post(
  '/',
  authenticate,
  requirePermission('inventory.create'),
  stockMovementController.recordMovement
);
