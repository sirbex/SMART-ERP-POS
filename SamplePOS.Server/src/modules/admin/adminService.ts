import { Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { adminRepository } from './adminRepository.js';
import logger from '../../utils/logger.js';
import { getBusinessDate, formatDateBusiness } from '../../utils/dateRange.js';

const execAsync = promisify(exec);

/**
 * Admin Service - Company data management operations
 * Handles backup, restore, and transaction clearing
 */

export const adminService = {
  /**
   * Create a full database backup using pg_dump
   * Returns the backup file path
   */
  async createDatabaseBackup(pool: Pool): Promise<{
    filePath: string;
    fileName: string;
    size: number;
    timestamp: Date;
  }> {
    try {
      const timestamp = new Date();
      const dateStr = formatDateBusiness(timestamp).replace(/-/g, '_');
      const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '_');
      const fileName = `company_backup_${dateStr}_${timeStr}.dump`;
      const backupDir = path.join(process.cwd(), 'backups');
      const filePath = path.join(backupDir, fileName);

      // Ensure backups directory exists
      await fs.mkdir(backupDir, { recursive: true });

      // Get database connection details from environment
      const dbUrl = process.env.DATABASE_URL || '';
      const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'pos_system';
      const dbUser = process.env.DB_USER || 'postgres';
      const dbPassword = process.env.DB_PASSWORD || 'password';
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = process.env.DB_PORT || '5432';

      // Set PGPASSWORD environment variable for pg_dump
      const env = {
        ...process.env,
        PGPASSWORD: dbPassword,
      };

      // Run pg_dump with custom format (compressed)
      const command = `pg_dump -Fc -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${filePath}"`;

      logger.info('Starting database backup', { fileName, dbName });

      await execAsync(command, { env });

      // Get file size
      const stats = await fs.stat(filePath);
      const size = stats.size;

      logger.info('Database backup completed', {
        fileName,
        size: `${(size / 1024 / 1024).toFixed(2)} MB`,
      });

      return {
        filePath,
        fileName,
        size,
        timestamp,
      };
    } catch (error) {
      logger.error('Database backup failed', { error });
      throw new Error(`Backup failed: ${(error as Error).message}`);
    }
  },

  /**
   * Restore database from a backup file using pg_restore
   */
  async restoreDatabaseBackup(
    pool: Pool,
    backupFilePath: string
  ): Promise<{
    success: boolean;
    restoredTables: number;
    message: string;
  }> {
    try {
      // Validate backup file exists
      await fs.access(backupFilePath);

      // Get database connection details
      const dbUrl = process.env.DATABASE_URL || '';
      const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'pos_system';
      const dbUser = process.env.DB_USER || 'postgres';
      const dbPassword = process.env.DB_PASSWORD || 'password';
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = process.env.DB_PORT || '5432';

      // Set PGPASSWORD environment variable
      const env = {
        ...process.env,
        PGPASSWORD: dbPassword,
      };

      logger.warn('Starting database restore - DESTRUCTIVE OPERATION', {
        backupFile: path.basename(backupFilePath),
      });

      // Run pg_restore with clean option (drops existing objects first)
      const command = `pg_restore -c -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} "${backupFilePath}"`;

      await execAsync(command, { env });

      // Get statistics after restore
      const stats = await adminRepository.getDatabaseStats(pool);
      const totalTables = Object.keys(stats.masterData).length + 
                         Object.keys(stats.transactionalData).length;

      logger.info('Database restore completed', {
        backupFile: path.basename(backupFilePath),
        tablesRestored: totalTables,
      });

      return {
        success: true,
        restoredTables: totalTables,
        message: 'Database restored successfully',
      };
    } catch (error) {
      logger.error('Database restore failed', { error });
      throw new Error(`Restore failed: ${(error as Error).message}`);
    }
  },

  /**
   * Clear all transactional data (ERP reset)
   * REQUIRES: confirmation phrase "CLEAR ALL DATA"
   */
  async clearAllTransactions(
    pool: Pool,
    confirmationPhrase: string,
    userId: string
  ): Promise<{
    success: boolean;
    deletedRecords: Record<string, number>;
    resetInventory: number;
    totalRecordsDeleted: number;
  }> {
    // Validate confirmation phrase
    if (confirmationPhrase !== 'CLEAR ALL DATA') {
      throw new Error(
        'Invalid confirmation phrase. Must type "CLEAR ALL DATA" exactly.'
      );
    }

    logger.warn('Transaction clearing requested', {
      userId,
      timestamp: new Date().toISOString(),
    });

    const result = await adminRepository.clearAllTransactions(pool);

    const totalRecordsDeleted = Object.values(result.deletedRecords).reduce(
      (sum, count) => sum + count,
      0
    );

    logger.warn('Transaction data cleared', {
      userId,
      totalRecordsDeleted,
      resetInventory: result.resetInventory,
    });

    return {
      success: true,
      deletedRecords: result.deletedRecords,
      resetInventory: result.resetInventory,
      totalRecordsDeleted,
    };
  },

  /**
   * Get list of available backup files
   */
  async listBackupFiles(): Promise<
    Array<{
      fileName: string;
      filePath: string;
      size: number;
      created: Date;
    }>
  > {
    try {
      const backupDir = path.join(process.cwd(), 'backups');

      // Ensure directory exists
      await fs.mkdir(backupDir, { recursive: true });

      const files = await fs.readdir(backupDir);

      const backupFiles = await Promise.all(
        files
          .filter((file) => file.endsWith('.dump'))
          .map(async (file) => {
            const filePath = path.join(backupDir, file);
            const stats = await fs.stat(filePath);
            return {
              fileName: file,
              filePath,
              size: stats.size,
              created: stats.birthtime,
            };
          })
      );

      // Sort by creation date (newest first)
      return backupFiles.sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch (error) {
      logger.error('Failed to list backup files', { error });
      return [];
    }
  },

  /**
   * Delete old backup files (keep last N backups)
   */
  async cleanupOldBackups(keepCount: number = 10): Promise<number> {
    try {
      const backups = await this.listBackupFiles();

      if (backups.length <= keepCount) {
        return 0;
      }

      const backupsToDelete = backups.slice(keepCount);
      let deletedCount = 0;

      for (const backup of backupsToDelete) {
        try {
          await fs.unlink(backup.filePath);
          deletedCount++;
          logger.info('Deleted old backup', { fileName: backup.fileName });
        } catch (error) {
          logger.error('Failed to delete backup', {
            fileName: backup.fileName,
            error,
          });
        }
      }

      return deletedCount;
    } catch (error) {
      logger.error('Backup cleanup failed', { error });
      return 0;
    }
  },

  /**
   * Get database statistics
   */
  async getDatabaseStatistics(pool: Pool) {
    const stats = await adminRepository.getDatabaseStats(pool);
    const integrity = await adminRepository.validateDatabaseIntegrity(pool);

    return {
      ...stats,
      integrity,
    };
  },

  /**
   * Export master data to JSON (portable backup alternative)
   */
  async exportMasterDataJSON(pool: Pool): Promise<string> {
    try {
      const data = await adminRepository.exportMasterDataToJSON(pool);

      const timestamp = getBusinessDate().replace(/-/g, '_');
      const fileName = `master_data_${timestamp}.json`;
      const backupDir = path.join(process.cwd(), 'backups');
      const filePath = path.join(backupDir, fileName);

      await fs.mkdir(backupDir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

      logger.info('Master data exported to JSON', { fileName });

      return filePath;
    } catch (error) {
      logger.error('Master data export failed', { error });
      throw new Error(`Export failed: ${(error as Error).message}`);
    }
  },
};
