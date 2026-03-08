import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { adminService } from './adminService.js';
import logger from '../../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { adminRepository } from './adminRepository.js';
import { asyncHandler, ValidationError, NotFoundError } from '../../middleware/errorHandler.js';

// Zod schemas for admin operations
const RestoreBodySchema = z.object({ filePath: z.string().min(1, 'Backup file path is required') });
const ClearTransactionsSchema = z.object({ confirmation: z.string().min(1, 'Confirmation phrase is required') });
const FileNameParamSchema = z.object({
  fileName: z.string().min(1)
    .refine(v => !v.includes('..') && !v.includes('/') && !v.includes('\\'), 'Invalid file name'),
});
const CleanupBackupsSchema = z.object({ keepCount: z.number().int().positive().optional().default(10) });

/**
 * Admin Controller - HTTP handlers for admin operations
 * Requires ADMIN or SUPER_ADMIN role
 */

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
  };
  pool?: Pool;
}

export const adminController = {
  /**
   * POST /api/admin/backup
   * Create and download a database backup
   */
  backup: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const pool = authReq.pool!;

    logger.info('Backup requested', {
      userId: authReq.user?.id,
      email: authReq.user?.email,
    });

    const backup = await adminService.createDatabaseBackup(pool);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.fileName}"`
    );
    res.setHeader('Content-Length', backup.size);

    // Stream the file to the client
    const fileStream = createReadStream(backup.filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error: Error) => {
      logger.error('Backup download error', { error });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to download backup',
        });
      }
    });

    fileStream.on('end', () => {
      logger.info('Backup downloaded', {
        userId: authReq.user?.id,
        fileName: backup.fileName,
      });
    });
  }),

  /**
   * POST /api/admin/restore
   * Restore database from backup file path
   */
  restore: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { filePath: requestedFile } = RestoreBodySchema.parse(req.body);

    const pool = authReq.pool!;

    // Security: ensure file is in backups directory
    const backupDir = path.join(process.cwd(), 'backups');
    const fileName = path.basename(requestedFile);
    const backupFilePath = path.join(backupDir, fileName);

    // Verify file exists
    try {
      await fs.access(backupFilePath);
    } catch {
      throw new NotFoundError('Backup file');
    }

    logger.warn('Database restore requested - DESTRUCTIVE', {
      userId: authReq.user?.id,
      email: authReq.user?.email,
      fileName,
    });

    const result = await adminService.restoreDatabaseBackup(pool, backupFilePath);

    res.json({
      success: true,
      data: result,
      message: 'Database restored successfully',
    });
  }),

  /**
   * POST /api/admin/clear-transactions
   * Clear all transactional data (ERP reset)
   */
  clearTransactions: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { confirmation } = ClearTransactionsSchema.parse(req.body);

    const pool = authReq.pool!;
    const userId = authReq.user?.id || 'unknown';

    logger.warn('Transaction clearing requested', {
      userId,
      email: authReq.user?.email,
    });

    const result = await adminService.clearAllTransactions(pool, confirmation, userId);

    res.json({
      success: true,
      data: result,
      message: `Deleted ${result.totalRecordsDeleted} records and reset ${result.resetInventory} products`,
    });
  }),

  /**
   * GET /api/admin/stats
   * Get database statistics
   */
  getStatistics: asyncHandler(async (req: Request, res: Response) => {
    const pool = (req as AuthRequest).pool!;
    const stats = await adminService.getDatabaseStatistics(pool);

    res.json({
      success: true,
      data: stats,
    });
  }),

  /**
   * GET /api/admin/backups
   * List available backup files
   */
  listBackups: asyncHandler(async (_req: Request, res: Response) => {
    const backups = await adminService.listBackupFiles();

    res.json({
      success: true,
      data: backups,
    });
  }),

  /**
   * DELETE /api/admin/backups/:fileName
   * Delete a specific backup file
   */
  deleteBackup: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { fileName } = FileNameParamSchema.parse(req.params);

    const backupDir = path.join(process.cwd(), 'backups');
    const filePath = path.join(backupDir, fileName);

    await fs.unlink(filePath);

    logger.info('Backup deleted', {
      userId: authReq.user?.id,
      fileName,
    });

    res.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  }),

  /**
   * POST /api/admin/cleanup-backups
   * Delete old backups (keep last N)
   */
  cleanupBackups: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { keepCount } = CleanupBackupsSchema.parse(req.body);

    const deletedCount = await adminService.cleanupOldBackups(keepCount);

    logger.info('Backup cleanup completed', {
      userId: authReq.user?.id,
      deletedCount,
      keepCount,
    });

    res.json({
      success: true,
      data: { deletedCount },
      message: `Deleted ${deletedCount} old backup(s)`,
    });
  }),

  /**
   * POST /api/admin/export-master-data
   * Export master data to JSON
   */
  exportMasterData: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const pool = authReq.pool!;

    const filePath = await adminService.exportMasterDataJSON(pool);

    logger.info('Master data exported', {
      userId: authReq.user?.id,
      filePath,
    });

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    res.json({
      success: true,
      data,
      message: 'Master data exported successfully',
    });
  }),

  /**
   * GET /api/admin/validate-integrity
   * Validate database integrity
   */
  validateIntegrity: asyncHandler(async (req: Request, res: Response) => {
    const pool = (req as AuthRequest).pool!;
    const integrity = await adminRepository.validateDatabaseIntegrity(pool);

    res.json({
      success: true,
      data: integrity,
    });
  }),
};
