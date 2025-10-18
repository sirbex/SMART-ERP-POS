import { Router } from 'express';
import inventoryRoutes from './inventory-routes';
import migrationRoutes from './migration-routes';

const router = Router();

// API version prefix
const API_VERSION = 'v1';

// Inventory routes
router.use(`/${API_VERSION}/inventory`, inventoryRoutes);

// Data migration routes
router.use(`/${API_VERSION}/migration`, migrationRoutes);

// Export the API router
export const apiRouter = router;