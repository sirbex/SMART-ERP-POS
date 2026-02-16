import express from 'express';
import path from 'path';
import { adminController } from './adminController.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { pool as globalPool } from '../../db/pool.js';

const router = express.Router();

// Middleware to attach pool to request
router.use((req, res, next) => {
  (req as any).pool = req.tenantPool || globalPool;
  next();
});

// All admin routes require authentication and ADMIN role
router.use(authenticate);
router.use(authorize('ADMIN'));

/**
 * Database Backup & Restore
 */

// POST /api/admin/backup - Create and download database backup
router.post('/backup', adminController.backup);

// GET /api/admin/backups - List available backup files
router.get('/backups', adminController.listBackups);

// DELETE /api/admin/backups/:fileName - Delete specific backup
router.delete('/backups/:fileName', adminController.deleteBackup);

// POST /api/admin/cleanup-backups - Delete old backups (keep last N)
router.post('/cleanup-backups', adminController.cleanupBackups);

// POST /api/admin/restore - Restore database from backup
// Note: File upload handling to be implemented with proper middleware
router.post('/restore', adminController.restore);

/**
 * Transaction Management
 */

// POST /api/admin/clear-transactions - Clear all transactional data
// Requires body: { confirmation: "CLEAR ALL DATA" }
router.post('/clear-transactions', adminController.clearTransactions);

/**
 * Database Statistics
 */

// GET /api/admin/stats - Get database statistics
router.get('/stats', adminController.getStatistics);

// GET /api/admin/validate-integrity - Validate database integrity
router.get('/validate-integrity', adminController.validateIntegrity);

/**
 * Master Data Export
 */

// POST /api/admin/export-master-data - Export master data to JSON
router.post('/export-master-data', adminController.exportMasterData);

export const adminRoutes = router;
