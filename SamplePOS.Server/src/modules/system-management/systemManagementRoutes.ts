import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { systemManagementService } from './systemManagementService.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import pool from '../../db/pool.js';
import logger from '../../utils/logger.js';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// ============================================================================
// INTERFACES
// ============================================================================

interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        fullName: string;
        role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
    };
    pool?: Pool;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Attach pool to request
router.use((req, res, next) => {
    (req as AuthRequest).pool = pool;
    next();
});

// All system management routes require ADMIN role
router.use(authenticate);
router.use(authorize('ADMIN'));

// ============================================================================
// BACKUP ENDPOINTS
// ============================================================================

/**
 * POST /api/system/backup
 * Create a full database backup
 * 
 * Body:
 *   - reason: string (required) - Reason for creating backup
 *   - backupType: 'FULL' | 'MASTER_DATA_ONLY' (optional, default: FULL)
 */
router.post('/backup', async (req: AuthRequest, res: Response) => {
    try {
        const { reason, backupType = 'FULL' } = req.body;

        if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
            res.status(400).json({
                success: false,
                error: 'Reason is required (minimum 3 characters)'
            });
            return;
        }

        const userId = req.user?.id || 'unknown';
        const userName = req.user?.fullName || req.user?.email || 'Unknown User';

        logger.info('Backup creation requested', {
            userId,
            reason,
            backupType
        });

        const backup = await systemManagementService.createBackup(
            pool,
            userId,
            userName,
            reason.trim(),
            backupType as 'FULL' | 'MASTER_DATA_ONLY'
        );

        res.json({
            success: true,
            data: {
                backupNumber: backup.backupNumber,
                fileName: backup.fileName,
                fileSize: backup.fileSize,
                fileSizeFormatted: `${(backup.fileSize / 1024 / 1024).toFixed(2)} MB`,
                checksum: backup.checksum,
                createdAt: backup.createdAt,
                status: backup.status
            },
            message: `Backup ${backup.backupNumber} created successfully`
        });

    } catch (error) {
        logger.error('Backup creation failed', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * GET /api/system/backups
 * List all available backups
 */
router.get('/backups', async (req: AuthRequest, res: Response) => {
    try {
        const backups = await systemManagementService.listBackups(pool);

        res.json({
            success: true,
            data: backups.map(b => ({
                id: b.id,
                backupNumber: b.backupNumber,
                fileName: b.fileName,
                fileSize: b.fileSize,
                fileSizeFormatted: `${(b.fileSize / 1024 / 1024).toFixed(2)} MB`,
                checksum: b.checksum,
                backupType: b.backupType,
                status: b.status,
                reason: b.reason,
                createdBy: b.createdByName,
                createdAt: b.createdAt,
                isVerified: b.isVerified
            }))
        });

    } catch (error) {
        logger.error('Failed to list backups', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * GET /api/system/backups/:id
 * Get backup details by ID or backup number
 */
router.get('/backups/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const backup = await systemManagementService.getBackup(pool, id);

        if (!backup) {
            res.status(404).json({
                success: false,
                error: 'Backup not found'
            });
            return;
        }

        res.json({
            success: true,
            data: backup
        });

    } catch (error) {
        logger.error('Failed to get backup', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * POST /api/system/backups/:id/verify
 * Verify backup integrity using checksum
 */
router.post('/backups/:id/verify', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const result = await systemManagementService.verifyBackupIntegrity(pool, id);

        res.json({
            success: result.valid,
            data: result,
            message: result.message
        });

    } catch (error) {
        logger.error('Backup verification failed', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * GET /api/system/backups/:id/download
 * Download backup file
 */
router.get('/backups/:id/download', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const backup = await systemManagementService.getBackup(pool, id);

        if (!backup) {
            res.status(404).json({
                success: false,
                error: 'Backup not found'
            });
            return;
        }

        // Verify file exists
        try {
            await fs.access(backup.filePath);
        } catch {
            res.status(404).json({
                success: false,
                error: 'Backup file not found on disk'
            });
            return;
        }

        // Stream file to client
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${backup.fileName}"`);
        res.setHeader('Content-Length', backup.fileSize);

        const fileStream = createReadStream(backup.filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            logger.error('Backup download error', { error });
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to download backup'
                });
            }
        });

    } catch (error) {
        logger.error('Backup download failed', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * DELETE /api/system/backups/:id
 * Delete a backup
 * 
 * Query:
 *   - deleteFile: boolean (optional) - Also delete the physical file
 */
router.delete('/backups/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { deleteFile } = req.query;
        const userId = req.user?.id || 'unknown';

        await systemManagementService.deleteBackup(
            pool,
            id,
            userId,
            deleteFile === 'true'
        );

        res.json({
            success: true,
            message: 'Backup deleted successfully'
        });

    } catch (error) {
        logger.error('Backup deletion failed', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * POST /api/system/backups/cleanup
 * Delete old backups, keep last N
 * 
 * Body:
 *   - keepCount: number (optional, default: 10)
 */
router.post('/backups/cleanup', async (req: AuthRequest, res: Response) => {
    try {
        const { keepCount = 10 } = req.body;
        const userId = req.user?.id || 'unknown';

        const result = await systemManagementService.cleanupOldBackups(
            pool,
            parseInt(keepCount),
            userId
        );

        res.json({
            success: true,
            data: result,
            message: `Deleted ${result.deleted} old backups, kept ${result.kept}`
        });

    } catch (error) {
        logger.error('Backup cleanup failed', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

// ============================================================================
// RESET ENDPOINTS
// ============================================================================

/**
 * POST /api/system/reset
 * Clear all transactional data (ERP Reset)
 * 
 * CRITICAL: This is a destructive operation
 * - Creates mandatory backup before reset
 * - Requires exact confirmation phrase
 * - Only ADMIN can execute
 * 
 * Body:
 *   - confirmText: string (required) - Must be exactly "RESET ALL TRANSACTIONS"
 *   - reason: string (required) - Reason for reset
 */
router.post('/reset', async (req: AuthRequest, res: Response) => {
    try {
        const { confirmText, reason } = req.body;

        // Validate inputs
        if (!confirmText || !reason) {
            res.status(400).json({
                success: false,
                error: 'Both confirmText and reason are required'
            });
            return;
        }

        if (typeof reason !== 'string' || reason.trim().length < 10) {
            res.status(400).json({
                success: false,
                error: 'Reason must be at least 10 characters'
            });
            return;
        }

        const userId = req.user?.id || 'unknown';
        const userName = req.user?.fullName || req.user?.email || 'Unknown User';
        const ipAddress = req.ip || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        logger.warn('SYSTEM RESET REQUESTED', {
            userId,
            userName,
            reason,
            ipAddress
        });

        const result = await systemManagementService.resetTransactionalData(
            pool,
            userId,
            userName,
            confirmText,
            reason.trim(),
            ipAddress,
            userAgent
        );

        res.json({
            success: true,
            data: {
                resetNumber: result.resetNumber,
                backupNumber: result.backupNumber,
                totalRecordsDeleted: result.totalRecordsDeleted,
                tablesCleared: result.tablesCleared,
                balancesReset: result.balancesReset,
                duration: `${result.duration}ms`
            },
            message: `System reset completed. ${result.totalRecordsDeleted} records deleted. Backup ${result.backupNumber} created.`
        });

    } catch (error) {
        logger.error('System reset failed', { error });
        res.status(400).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * GET /api/system/reset/preview
 * Preview what would be cleared in a reset (dry run)
 */
router.get('/reset/preview', async (req: AuthRequest, res: Response) => {
    try {
        const stats = await systemManagementService.getStatistics(pool);

        // Calculate totals
        const transactionalTotal = Object.values(stats.transactionalData)
            .reduce((a, b) => a + b, 0);
        const accountingTotal = Object.values(stats.accountingData)
            .reduce((a, b) => a + b, 0);

        res.json({
            success: true,
            data: {
                willBeCleared: {
                    transactionalData: stats.transactionalData,
                    accountingData: stats.accountingData,
                    totalRecords: transactionalTotal + accountingTotal
                },
                willBePreserved: {
                    masterData: stats.masterData
                },
                lastBackup: stats.lastBackup ? {
                    backupNumber: stats.lastBackup.backupNumber,
                    createdAt: stats.lastBackup.createdAt
                } : null,
                lastReset: stats.lastReset,
                confirmationRequired: 'RESET ALL TRANSACTIONS'
            }
        });

    } catch (error) {
        logger.error('Reset preview failed', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

// ============================================================================
// RESTORE ENDPOINTS
// ============================================================================

/**
 * POST /api/system/restore/:backupId
 * Restore database from a backup
 * 
 * CRITICAL: This is a destructive operation
 * - Overwrites current database
 * - Requires backup integrity verification
 */
router.post('/restore/:backupId', async (req: AuthRequest, res: Response) => {
    try {
        const { backupId } = req.params;
        const userId = req.user?.id || 'unknown';
        const userName = req.user?.fullName || req.user?.email || 'Unknown User';

        logger.warn('DATABASE RESTORE REQUESTED', {
            userId,
            userName,
            backupId
        });

        const result = await systemManagementService.restoreFromBackup(
            pool,
            backupId,
            userId,
            userName
        );

        res.json({
            success: true,
            data: {
                backupNumber: result.backupNumber,
                restoredAt: result.restoredAt,
                tablesRestored: result.tablesRestored,
                integrityCheck: result.integrityCheck
            },
            message: `Database restored from ${result.backupNumber}`
        });

    } catch (error) {
        logger.error('Database restore failed', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

// ============================================================================
// STATUS & STATISTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/system/stats
 * Get comprehensive database statistics
 */
router.get('/stats', async (req: AuthRequest, res: Response) => {
    try {
        const stats = await systemManagementService.getStatistics(pool);

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Failed to get statistics', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * GET /api/system/validate
 * Validate database integrity
 */
router.get('/validate', async (req: AuthRequest, res: Response) => {
    try {
        const result = await systemManagementService.validateIntegrity(pool);

        res.json({
            success: result.valid,
            data: result,
            message: result.valid
                ? 'Database integrity validated'
                : `Found ${result.issues.length} integrity issues`
        });

    } catch (error) {
        logger.error('Integrity validation failed', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

/**
 * GET /api/system/maintenance-mode
 * Check if system is in maintenance mode
 */
router.get('/maintenance-mode', async (req: AuthRequest, res: Response) => {
    try {
        const isActive = await systemManagementService.isMaintenanceMode(pool);

        res.json({
            success: true,
            data: {
                maintenanceMode: isActive
            }
        });

    } catch (error) {
        logger.error('Failed to check maintenance mode', { error });
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

export const systemManagementRoutes = router;
export default systemManagementRoutes;
