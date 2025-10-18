import { Router } from 'express';
import * as migrationController from '../controllers/migration-controller';
import { validateMigrationData } from '../middleware/validators';

const router = Router();

// Data Migration Routes
router.post('/from-localstorage', validateMigrationData, migrationController.migrateFromLocalStorage);
router.get('/status', migrationController.getMigrationStatus);
router.delete('/clear-all', migrationController.clearAllData); // Development only

export default router;