import { Router } from 'express';
import * as migrationController from '../controllers/migration-controller';
import { validateMigrationData, validateRequest } from '../middleware/validators';

const router = Router();

// Data migration routes
router.post('/migrate/local-storage', validateMigrationData, validateRequest, migrationController.migrateFromLocalStorage);
router.get('/migrate/status', migrationController.getMigrationStatus);
router.post('/migrate/clear', migrationController.clearAllData);

export default router;