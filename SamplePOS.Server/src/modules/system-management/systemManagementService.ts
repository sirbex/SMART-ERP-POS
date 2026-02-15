import { Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
    systemManagementRepository,
    BackupRecord,
    ResetResult,
    RestoreResult,
    DatabaseStats
} from './systemManagementRepository.js';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

// ============================================================================
// CONSTANTS
// ============================================================================

const CONFIRMATION_PHRASE = 'RESET ALL TRANSACTIONS';
const BACKUP_DIR = path.join(process.cwd(), 'backups');

// ============================================================================
// SYSTEM MANAGEMENT SERVICE
// ============================================================================

export const systemManagementService = {
    // ==========================================================================
    // BACKUP OPERATIONS
    // ==========================================================================

    /**
     * Create a full database backup with checksum and tracking
     * ALWAYS call this before any reset operation
     */
    async createBackup(
        pool: Pool,
        userId: string,
        userName: string,
        reason: string,
        backupType: 'FULL' | 'MASTER_DATA_ONLY' = 'FULL'
    ): Promise<BackupRecord> {
        const startTime = Date.now();

        try {
            // Ensure backup directory exists
            await fs.mkdir(BACKUP_DIR, { recursive: true });

            // Generate filename
            const timestamp = new Date();
            const dateStr = timestamp.toISOString().replace(/[:.]/g, '-').split('T')[0];
            const timeStr = timestamp.toISOString().split('T')[1].substring(0, 8).replace(/:/g, '-');
            const fileName = `backup_${dateStr}_${timeStr}.dump`;
            const filePath = path.join(BACKUP_DIR, fileName);

            // Get database connection details
            const dbUrl = process.env.DATABASE_URL || '';
            const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'pos_system';
            const dbUser = process.env.DB_USER || 'postgres';
            const dbPassword = process.env.DB_PASSWORD || 'password';
            const dbHost = process.env.DB_HOST || 'localhost';
            const dbPort = process.env.DB_PORT || '5432';

            // Environment with password
            const env = { ...process.env, PGPASSWORD: dbPassword };

            logger.info('Starting database backup', {
                fileName,
                dbName,
                backupType,
                reason
            });

            // Run pg_dump with custom format (compressed)
            const command = `pg_dump -Fc -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${filePath}"`;
            await execAsync(command, { env });

            // Get file stats
            const stats = await fs.stat(filePath);
            const fileSize = stats.size;

            // Calculate checksum
            const checksum = await this.calculateFileChecksum(filePath);

            // Get database stats snapshot
            const dbStats = await systemManagementRepository.getDatabaseStats(pool);

            // Record backup in database
            const backupRecord = await systemManagementRepository.createBackupRecord(pool, {
                fileName,
                filePath,
                fileSize,
                checksum,
                backupType,
                reason,
                userId,
                userName,
                statsSnapshot: {
                    masterData: dbStats.masterData,
                    transactionalData: dbStats.transactionalData,
                    accountingData: dbStats.accountingData,
                    databaseSize: dbStats.databaseSize
                }
            });

            const duration = Date.now() - startTime;
            logger.info('Database backup completed', {
                backupNumber: backupRecord.backupNumber,
                fileName,
                size: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
                duration: `${duration}ms`,
                checksum
            });

            return backupRecord;

        } catch (error) {
            logger.error('Database backup failed', { error, reason });
            throw new Error(`Backup failed: ${(error as Error).message}`);
        }
    },

    /**
     * Calculate SHA-256 checksum of a file
     */
    async calculateFileChecksum(filePath: string): Promise<string> {
        const fileBuffer = await fs.readFile(filePath);
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    },

    /**
     * Verify backup file integrity using checksum
     */
    async verifyBackupIntegrity(
        pool: Pool,
        backupId: string
    ): Promise<{ valid: boolean; message: string }> {
        const backup = await systemManagementRepository.getBackupById(pool, backupId);

        if (!backup) {
            return { valid: false, message: 'Backup not found' };
        }

        try {
            // Check file exists
            await fs.access(backup.filePath);

            // Recalculate checksum
            const currentChecksum = await this.calculateFileChecksum(backup.filePath);

            if (currentChecksum !== backup.checksum) {
                return {
                    valid: false,
                    message: `Checksum mismatch. Expected: ${backup.checksum}, Got: ${currentChecksum}`
                };
            }

            // Mark as verified
            await systemManagementRepository.updateBackupStatus(pool, backupId, 'VERIFIED');

            return { valid: true, message: 'Backup integrity verified' };

        } catch (error) {
            logger.error('Verification error', { error: (error as Error).message });
            return {
                valid: false,
                message: `Verification failed: ${(error as Error).message}`
            };
        }
    },

    /**
     * List all available backups
     */
    async listBackups(pool: Pool): Promise<BackupRecord[]> {
        return systemManagementRepository.listBackups(pool);
    },

    /**
     * Get backup details by ID or number
     */
    async getBackup(
        pool: Pool,
        identifier: string
    ): Promise<BackupRecord | null> {
        // Check if it's a backup number (BACKUP-YYYY-NNNN format)
        if (identifier.startsWith('BACKUP-')) {
            return systemManagementRepository.getBackupByNumber(pool, identifier);
        }
        return systemManagementRepository.getBackupById(pool, identifier);
    },

    /**
     * Delete a backup (soft delete)
     */
    async deleteBackup(
        pool: Pool,
        backupId: string,
        userId: string,
        deleteFile: boolean = false
    ): Promise<void> {
        const backup = await systemManagementRepository.getBackupById(pool, backupId);

        if (!backup) {
            throw new Error('Backup not found');
        }

        // Soft delete in database
        await systemManagementRepository.softDeleteBackup(pool, backupId, userId);

        // Optionally delete the physical file
        if (deleteFile) {
            try {
                await fs.unlink(backup.filePath);
                logger.info('Backup file deleted', {
                    backupNumber: backup.backupNumber,
                    fileName: backup.fileName
                });
            } catch (error) {
                logger.warn('Failed to delete backup file', {
                    backupNumber: backup.backupNumber,
                    error
                });
            }
        }
    },

    // ==========================================================================
    // RESET OPERATIONS
    // ==========================================================================

    /**
     * Clear all transactional data (ERP Reset)
     * REQUIRES: confirmation phrase, mandatory backup first
     */
    async resetTransactionalData(
        pool: Pool,
        userId: string,
        userName: string,
        confirmationPhrase: string,
        reason: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<ResetResult> {
        const startTime = Date.now();

        // =========================================================================
        // STEP 1: VALIDATE CONFIRMATION PHRASE
        // =========================================================================
        if (confirmationPhrase !== CONFIRMATION_PHRASE) {
            throw new Error(
                `Invalid confirmation phrase. You must type "${CONFIRMATION_PHRASE}" exactly.`
            );
        }

        // =========================================================================
        // STEP 2: CREATE MANDATORY BACKUP FIRST
        // =========================================================================
        logger.warn('Starting system reset - Creating mandatory backup first', {
            userId,
            reason
        });

        const backup = await this.createBackup(
            pool,
            userId,
            userName,
            `Pre-reset backup: ${reason}`,
            'FULL'
        );

        // Verify backup was created successfully
        if (!backup || backup.status !== 'COMPLETED') {
            throw new Error('Failed to create pre-reset backup. Reset aborted for safety.');
        }

        logger.info('Pre-reset backup created', {
            backupNumber: backup.backupNumber
        });

        // =========================================================================
        // STEP 3: CREATE RESET LOG ENTRY
        // =========================================================================
        const resetNumber = await systemManagementRepository.createResetLog(pool, {
            resetType: 'TRANSACTIONS_ONLY',
            backupId: backup.id,
            backupNumber: backup.backupNumber,
            userId,
            userName,
            confirmationPhrase,
            reason,
            ipAddress,
            userAgent
        });

        // =========================================================================
        // STEP 4: ENABLE MAINTENANCE MODE
        // =========================================================================
        await systemManagementRepository.enableMaintenanceMode(
            pool,
            `System reset in progress: ${reason}`,
            'RESET',
            userId
        );

        // =========================================================================
        // STEP 5: EXECUTE RESET IN TRANSACTION
        // =========================================================================
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Disable triggers temporarily for faster deletion (prevents cascade trigger execution)
            // This allows TRUNCATE CASCADE to work without triggering additional operations
            await client.query('SET session_replication_role = replica');

            // Clear all transactional data using TRUNCATE CASCADE for reliability
            const { tablesCleared, balancesReset } =
                await systemManagementRepository.clearAllTransactionalData(client);

            // Re-enable triggers before commit
            await client.query('SET session_replication_role = DEFAULT');

            await client.query('COMMIT');

            // =========================================================================
            // STEP 6: COMPLETE RESET LOG
            // =========================================================================
            await systemManagementRepository.completeResetLog(
                pool,
                resetNumber,
                tablesCleared,
                balancesReset
            );

            const duration = Date.now() - startTime;
            const totalRecordsDeleted = Object.values(tablesCleared).reduce((a, b) => a + b, 0);

            logger.warn('System reset completed successfully', {
                resetNumber,
                backupNumber: backup.backupNumber,
                totalRecordsDeleted,
                balancesReset,
                duration: `${duration}ms`
            });

            return {
                success: true,
                resetNumber,
                backupNumber: backup.backupNumber,
                tablesCleared,
                totalRecordsDeleted,
                balancesReset: {
                    customers: balancesReset['customers'] || 0,
                    suppliers: balancesReset['suppliers'] || 0,
                    inventory: balancesReset['inventory'] || 0,
                    accounts: balancesReset['accounts'] || 0
                },
                duration
            };

        } catch (error) {
            await client.query('ROLLBACK');

            // Re-enable triggers in case of failure
            try {
                await client.query('SET session_replication_role = DEFAULT');
            } catch {
                // Ignore - rollback already handles cleanup
            }

            // Log failure
            await systemManagementRepository.failResetLog(
                pool,
                resetNumber,
                (error as Error).message,
                'Transaction rolled back due to error'
            );

            logger.error('System reset FAILED - Rolled back', {
                resetNumber,
                error
            });

            throw new Error(`Reset failed: ${(error as Error).message}. Changes rolled back.`);

        } finally {
            client.release();

            // Always disable maintenance mode
            await systemManagementRepository.disableMaintenanceMode(pool, userId);
        }
    },

    // ==========================================================================
    // RESTORE OPERATIONS
    // ==========================================================================

    /**
     * Restore database from a backup
     * REQUIRES: Valid backup, maintenance mode
     */
    async restoreFromBackup(
        pool: Pool,
        backupId: string,
        userId: string,
        userName: string
    ): Promise<RestoreResult> {
        const startTime = Date.now();

        // =========================================================================
        // STEP 1: GET AND VALIDATE BACKUP
        // =========================================================================
        const backup = await systemManagementRepository.getBackupById(pool, backupId);

        if (!backup) {
            throw new Error('Backup not found');
        }

        // Verify file exists
        try {
            await fs.access(backup.filePath);
        } catch {
            throw new Error(`Backup file not found: ${backup.fileName}`);
        }

        // Verify checksum
        const integrityCheck = await this.verifyBackupIntegrity(pool, backupId);
        if (!integrityCheck.valid) {
            throw new Error(`Backup integrity check failed: ${integrityCheck.message}`);
        }

        logger.warn('Starting database restore from backup', {
            backupNumber: backup.backupNumber,
            userId,
            userName
        });

        // =========================================================================
        // STEP 2: ENABLE MAINTENANCE MODE
        // =========================================================================
        await systemManagementRepository.enableMaintenanceMode(
            pool,
            `Restoring from backup: ${backup.backupNumber}`,
            'RESTORE',
            userId
        );

        try {
            // =========================================================================
            // STEP 3: EXECUTE RESTORE
            // =========================================================================
            const dbUrl = process.env.DATABASE_URL || '';
            const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'pos_system';
            const dbUser = process.env.DB_USER || 'postgres';
            const dbPassword = process.env.DB_PASSWORD || 'password';
            const dbHost = process.env.DB_HOST || 'localhost';
            const dbPort = process.env.DB_PORT || '5432';

            const env = { ...process.env, PGPASSWORD: dbPassword };

            // pg_restore with clean option
            const command = `pg_restore -c --if-exists -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} "${backup.filePath}"`;

            await execAsync(command, { env });

            // =========================================================================
            // STEP 4: VALIDATE RESTORED DATA
            // =========================================================================
            const integrityResult = await systemManagementRepository.validateDatabaseIntegrity(pool);

            // =========================================================================
            // STEP 5: INCREMENT RESTORE COUNT
            // =========================================================================
            await systemManagementRepository.incrementRestoreCount(pool, backupId, userId);

            const duration = Date.now() - startTime;

            logger.info('Database restore completed', {
                backupNumber: backup.backupNumber,
                duration: `${duration}ms`,
                integrityValid: integrityResult.valid
            });

            return {
                success: true,
                backupNumber: backup.backupNumber,
                restoredAt: new Date(),
                tablesRestored: Object.keys(backup.statsSnapshot?.transactionalData || {}).length,
                integrityCheck: integrityResult
            };

        } catch (error) {
            logger.error('Database restore FAILED', {
                backupNumber: backup.backupNumber,
                error
            });
            throw new Error(`Restore failed: ${(error as Error).message}`);

        } finally {
            // Always disable maintenance mode
            await systemManagementRepository.disableMaintenanceMode(pool, userId);
        }
    },

    // ==========================================================================
    // STATISTICS & VALIDATION
    // ==========================================================================

    /**
     * Get comprehensive database statistics
     */
    async getStatistics(pool: Pool): Promise<DatabaseStats> {
        return systemManagementRepository.getDatabaseStats(pool);
    },

    /**
     * Validate database integrity
     */
    async validateIntegrity(pool: Pool): Promise<{ valid: boolean; issues: string[] }> {
        return systemManagementRepository.validateDatabaseIntegrity(pool);
    },

    /**
     * Check if system is in maintenance mode
     */
    async isMaintenanceMode(pool: Pool): Promise<boolean> {
        return systemManagementRepository.isMaintenanceMode(pool);
    },

    /**
     * Clean up old backups (keep last N)
     */
    async cleanupOldBackups(
        pool: Pool,
        keepCount: number = 10,
        userId: string
    ): Promise<{ deleted: number; kept: number }> {
        const backups = await systemManagementRepository.listBackups(pool);

        if (backups.length <= keepCount) {
            return { deleted: 0, kept: backups.length };
        }

        const toDelete = backups.slice(keepCount);
        let deletedCount = 0;

        for (const backup of toDelete) {
            try {
                await this.deleteBackup(pool, backup.id, userId, true);
                deletedCount++;
            } catch (error) {
                logger.warn('Failed to delete old backup', {
                    backupNumber: backup.backupNumber,
                    error
                });
            }
        }

        return { deleted: deletedCount, kept: keepCount };
    }
};

export default systemManagementService;
