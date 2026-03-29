import express from 'express';
import path from 'path';
import { adminController } from './adminController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { pool as globalPool } from '../../db/pool.js';

const router = express.Router();

// Middleware to attach pool to request
router.use((req, res, next) => {
  req.pool = req.tenantPool || globalPool;
  next();
});

// All admin routes require authentication and admin permissions
router.use(authenticate);
router.use(requirePermission('admin.read'));

/**
 * Database Backup & Restore
 */

// POST /api/admin/backup - Create and download database backup
router.post('/backup', requirePermission('admin.create'), adminController.backup);

// GET /api/admin/backups - List available backup files
router.get('/backups', adminController.listBackups);

// DELETE /api/admin/backups/:fileName - Delete specific backup
router.delete('/backups/:fileName', requirePermission('admin.delete'), adminController.deleteBackup);

// POST /api/admin/cleanup-backups - Delete old backups (keep last N)
router.post('/cleanup-backups', requirePermission('admin.delete'), adminController.cleanupBackups);

// POST /api/admin/restore - Restore database from backup
// Note: File upload handling to be implemented with proper middleware
router.post('/restore', requirePermission('admin.update'), adminController.restore);

/**
 * Transaction Management
 */

// POST /api/admin/clear-transactions - Clear all transactional data
// Requires body: { confirmation: "CLEAR ALL DATA" }
router.post('/clear-transactions', requirePermission('admin.delete'), adminController.clearTransactions);

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
