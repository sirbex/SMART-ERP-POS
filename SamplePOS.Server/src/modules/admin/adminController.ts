import { Request, Response } from 'express';
import { Pool } from 'pg';
import { adminService } from './adminService.js';
import logger from '../../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { adminRepository } from './adminRepository.js';

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
  async backup(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pool = req.pool!;

      logger.info('Backup requested', {
        userId: req.user?.id,
        email: req.user?.email,
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
          userId: req.user?.id,
          fileName: backup.fileName,
        });
      });
    } catch (error) {
      logger.error('Backup creation failed', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * POST /api/admin/restore
   * Restore database from backup file path
   * Body:
   *   - filePath: Absolute path to .dump file in backups directory
   */
  async restore(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { filePath: requestedFile } = req.body;

      if (!requestedFile) {
        res.status(400).json({
          success: false,
          error: 'No backup file path provided',
        });
        return;
      }

      const pool = req.pool!;

      // Security: ensure file is in backups directory
      const backupDir = path.join(process.cwd(), 'backups');
      const fileName = path.basename(requestedFile);
      const backupFilePath = path.join(backupDir, fileName);

      // Verify file exists
      try {
        await fs.access(backupFilePath);
      } catch {
        res.status(404).json({
          success: false,
          error: 'Backup file not found',
        });
        return;
      }

      logger.warn('Database restore requested - DESTRUCTIVE', {
        userId: req.user?.id,
        email: req.user?.email,
        fileName,
      });

      const result = await adminService.restoreDatabaseBackup(
        pool,
        backupFilePath
      );

      res.json({
        success: true,
        data: result,
        message: 'Database restored successfully',
      });
    } catch (error) {
      logger.error('Database restore failed', { error });

      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * POST /api/admin/clear-transactions
   * Clear all transactional data (ERP reset)
   * Body:
   *   - confirmation: "CLEAR ALL DATA" (exact match required)
   */
  async clearTransactions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { confirmation } = req.body;

      if (!confirmation) {
        res.status(400).json({
          success: false,
          error: 'Confirmation phrase is required',
        });
        return;
      }

      const pool = req.pool!;
      const userId = req.user?.id || 'unknown';

      logger.warn('Transaction clearing requested', {
        userId,
        email: req.user?.email,
      });

      const result = await adminService.clearAllTransactions(
        pool,
        confirmation,
        userId
      );

      res.json({
        success: true,
        data: result,
        message: `Deleted ${result.totalRecordsDeleted} records and reset ${result.resetInventory} products`,
      });
    } catch (error) {
      logger.error('Transaction clearing failed', { error });
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * GET /api/admin/stats
   * Get database statistics
   */
  async getStatistics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pool = req.pool!;

      const stats = await adminService.getDatabaseStatistics(pool);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get statistics', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * GET /api/admin/backups
   * List available backup files
   */
  async listBackups(req: AuthRequest, res: Response): Promise<void> {
    try {
      const backups = await adminService.listBackupFiles();

      res.json({
        success: true,
        data: backups,
      });
    } catch (error) {
      logger.error('Failed to list backups', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * DELETE /api/admin/backups/:fileName
   * Delete a specific backup file
   */
  async deleteBackup(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { fileName } = req.params;

      // Security: prevent path traversal
      if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        res.status(400).json({
          success: false,
          error: 'Invalid file name',
        });
        return;
      }

      const backupDir = path.join(process.cwd(), 'backups');
      const filePath = path.join(backupDir, fileName);

      await fs.unlink(filePath);

      logger.info('Backup deleted', {
        userId: req.user?.id,
        fileName,
      });

      res.json({
        success: true,
        message: 'Backup deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete backup', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * POST /api/admin/cleanup-backups
   * Delete old backups (keep last N)
   * Body:
   *   - keepCount: number (default 10)
   */
  async cleanupBackups(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { keepCount = 10 } = req.body;

      const deletedCount = await adminService.cleanupOldBackups(keepCount);

      logger.info('Backup cleanup completed', {
        userId: req.user?.id,
        deletedCount,
        keepCount,
      });

      res.json({
        success: true,
        data: { deletedCount },
        message: `Deleted ${deletedCount} old backup(s)`,
      });
    } catch (error) {
      logger.error('Backup cleanup failed', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * POST /api/admin/export-master-data
   * Export master data to JSON
   */
  async exportMasterData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pool = req.pool!;

      const filePath = await adminService.exportMasterDataJSON(pool);

      logger.info('Master data exported', {
        userId: req.user?.id,
        filePath,
      });

      // Read the file and send as JSON response
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      res.json({
        success: true,
        data,
        message: 'Master data exported successfully',
      });
    } catch (error) {
      logger.error('Master data export failed', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * GET /api/admin/validate-integrity
   * Validate database integrity
   */
  async validateIntegrity(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pool = req.pool!;

      const integrity = await adminRepository.validateDatabaseIntegrity(pool);

      res.json({
        success: true,
        data: integrity,
      });
    } catch (error) {
      logger.error('Integrity validation failed', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },
};
