import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/auth.js';
import { requirePermission } from '../../../rbac/middleware.js';
import { asyncHandler, UnauthorizedError } from '../../../middleware/errorHandler.js';
import { pool as globalPool } from '../../../db/pool.js';
import { expiryAutomationService } from './expiryAutomationService.js';

const router = Router();

router.use(authenticate);

const ProcessExpirySchema = z.object({
    dryRun: z.boolean().optional(),
    force: z.boolean().optional(),
});

router.get(
    '/preview',
    requirePermission('inventory.read'),
    asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const result = await expiryAutomationService.preview(pool);
        res.json({ success: true, data: result });
    }),
);

router.post(
    '/process',
    requirePermission('inventory.manage'),
    asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const userId = req.user?.id;
        if (!userId) throw new UnauthorizedError('Unauthorized - user ID not found');

        const body = ProcessExpirySchema.parse(req.body ?? {});
        const result = await expiryAutomationService.processExpiredLots(pool, userId, {
            dryRun: body.dryRun,
            force: body.force ?? true,
        });

        res.json({
            success: true,
            data: result,
            message: body.dryRun
                ? 'Expiry preview generated'
                : `Processed ${result.linesProcessed} expired lot line(s)`,
        });
    }),
);

export const expiryAutomationRoutes = router;
