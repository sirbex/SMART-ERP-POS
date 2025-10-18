import { Router } from 'express';
import * as inventoryController from '../controllers/inventory-controller';
import * as batchController from '../controllers/batch-controller';
import { validateInventoryItem, validateInventoryBatch, validateBatchQuantityAdjustment } from '../middleware/validators';

const router = Router();

// Inventory Items Routes
router.get('/', inventoryController.getAllItems);
router.get('/search', inventoryController.searchItems);
router.get('/low-stock', inventoryController.getLowStockItems);
router.get('/:id', inventoryController.getItemById);
router.post('/', validateInventoryItem, inventoryController.createItem);
router.put('/:id', validateInventoryItem, inventoryController.updateItem);
router.delete('/:id', inventoryController.deleteItem);

// Inventory Batches Routes
router.get('/batches/:id', batchController.getBatchById);
router.get('/batches/:id/history', batchController.getBatchHistory);
router.get('/item/:itemId/batches', batchController.getBatchesByItemId);
router.post('/batches', validateInventoryBatch, batchController.createBatch);
router.put('/batches/:id', validateInventoryBatch, batchController.updateBatch);
router.delete('/batches/:id', batchController.deleteBatch);
router.post('/batches/:id/adjust', validateBatchQuantityAdjustment, batchController.adjustBatchQuantity);

export default router;