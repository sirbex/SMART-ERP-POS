// Sync Routes — Edge Node ↔ Cloud Synchronization API
// File: SamplePOS.Server/src/modules/platform/syncRoutes.ts
//
// Used by edge/on-premises nodes to push local changes to the cloud
// and pull updates from the cloud.

import { Router, type Request, type Response } from 'express';
import { connectionManager } from '../../db/connectionManager.js';
import { syncService } from './syncService.js';
import { SyncBatchSchema } from '../../../../shared/zod/tenant.js';
import { authenticate } from '../../middleware/auth.js';
import { getTenantPool, verifyTenantAccess } from '../../middleware/tenantMiddleware.js';
import logger from '../../utils/logger.js';

const router = Router();

// ============================================================
// UPLOAD: Edge → Cloud (push local changes)
// ============================================================

router.post('/upload', authenticate, verifyTenantAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = SyncBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required for sync' });
      return;
    }

    // Verify the batch tenant matches the authenticated tenant
    if (parsed.data.tenantId !== tenantId) {
      res.status(403).json({ success: false, error: 'Tenant ID mismatch' });
      return;
    }

    const masterPool = connectionManager.getMasterPool();
    const tenantPool = getTenantPool(req);

    // Mark tenant as syncing
    await masterPool.query(
      `UPDATE tenants SET sync_status = 'SYNCING' WHERE id = $1`,
      [tenantId]
    );

    const result = await syncService.processSyncBatch(masterPool, tenantPool, tenantId, parsed.data);

    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Sync upload failed', { error });
    res.status(500).json({ success: false, error: 'Sync upload failed' });
  }
});

// ============================================================
// DOWNLOAD: Cloud → Edge (pull updates)
// ============================================================

router.get('/download', authenticate, verifyTenantAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required for sync' });
      return;
    }

    const since = (req.query.since as string) || '1970-01-01T00:00:00Z';
    const entityTypes = req.query.types
      ? (req.query.types as string).split(',')
      : undefined;
    const limit = Math.min(parseInt(req.query.limit as string || '500', 10), 1000);

    const tenantPool = getTenantPool(req);
    const result = await syncService.getChangesSince(tenantPool, since, entityTypes, limit);

    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Sync download failed', { error });
    res.status(500).json({ success: false, error: 'Sync download failed' });
  }
});

// ============================================================
// SYNC STATUS
// ============================================================

router.get('/status', authenticate, verifyTenantAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required' });
      return;
    }

    const masterPool = connectionManager.getMasterPool();
    const status = await syncService.getSyncStatus(masterPool, tenantId);

    res.json({ success: true, data: status });

  } catch (error) {
    logger.error('Failed to get sync status', { error });
    res.status(500).json({ success: false, error: 'Failed to get sync status' });
  }
});

// ============================================================
// CONFLICTS
// ============================================================

router.get('/conflicts', authenticate, verifyTenantAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required' });
      return;
    }

    const masterPool = connectionManager.getMasterPool();
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
    const conflicts = await syncService.getConflicts(masterPool, tenantId, limit);

    res.json({ success: true, data: conflicts });

  } catch (error) {
    logger.error('Failed to get conflicts', { error });
    res.status(500).json({ success: false, error: 'Failed to get conflicts' });
  }
});

router.post('/conflicts/resolve', authenticate, verifyTenantAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required' });
      return;
    }

    const { entityType, entityId, resolution } = req.body;
    if (!entityType || !entityId || !['LOCAL_WINS', 'SERVER_WINS'].includes(resolution)) {
      res.status(400).json({ success: false, error: 'entityType, entityId, and resolution (LOCAL_WINS/SERVER_WINS) required' });
      return;
    }

    const masterPool = connectionManager.getMasterPool();
    const tenantPool = getTenantPool(req);

    await syncService.resolveConflict(masterPool, tenantPool, tenantId, entityType, entityId, resolution);

    res.json({ success: true, message: 'Conflict resolved' });

  } catch (error) {
    logger.error('Failed to resolve conflict', { error });
    res.status(500).json({ success: false, error: 'Failed to resolve conflict' });
  }
});

export default router;
export { router as syncRoutes };
