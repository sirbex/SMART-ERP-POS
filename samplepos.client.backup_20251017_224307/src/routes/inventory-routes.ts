import { Router } from 'express';
import * as inventoryController from '../controllers/inventory-controller';
import * as batchController from '../controllers/batch-controller';
import { validateInventoryItem, validateBatchAdjustment, validateRequest } from '../middleware/validators';

const router = Router();

// Inventory Item routes
router.get('/items', inventoryController.getAllItems);
router.get('/items/:id', inventoryController.getItemById);
router.post('/items', validateInventoryItem, validateRequest, inventoryController.createItem);
router.put('/items/:id', validateInventoryItem, validateRequest, inventoryController.updateItem);
router.delete('/items/:id', inventoryController.deleteItem);
router.get('/items/search', inventoryController.searchItems);
router.get('/items/low-stock', inventoryController.getLowStockItems);

// Inventory Batch routes
router.get('/batches/:itemId', batchController.getBatchesByItemId);
router.post('/batches/adjust', validateBatchAdjustment, validateRequest, batchController.adjustBatchQuantity);
router.get('/batches/history/:batchId', batchController.getBatchHistory);
router.get('/batches/expiring', batchController.getExpiringBatches);

export default router;