/**
 * System Management Module
 * 
 * ERP-Grade Backup, Clear/Reset, and Restore functionality
 * 
 * Features:
 * - Full database backups with checksums
 * - Safe transactional data clearing (preserves master data)
 * - Database restoration with integrity verification
 * - Maintenance mode for safe operations
 * - Comprehensive audit logging
 */

export { systemManagementRoutes } from './systemManagementRoutes.js';
export { systemManagementService } from './systemManagementService.js';
export { systemManagementRepository } from './systemManagementRepository.js';

export type {
    BackupRecord,
    ResetResult,
    RestoreResult,
    DatabaseStats
} from './systemManagementRepository.js';
