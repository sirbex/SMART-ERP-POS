import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../middleware/auth.js';
import { requirePermission } from '../../../rbac/middleware.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { pool as globalPool } from '../../../db/pool.js';
import { warehouseReportingService } from './warehouseReportingService.js';

const router = Router();

router.use(authenticate);
router.use(requirePermission('inventory.read'));

const DaysQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).optional(),
});

router.get(
    '/network',
    asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const { days = 7 } = DaysQuerySchema.parse(req.query);
        const data = await warehouseReportingService.getNetworkReport(pool, days);
        res.json({ success: true, data });
    }),
);

router.get(
    '/network/summary',
    asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const { days = 7 } = DaysQuerySchema.parse(req.query);
        const data = await warehouseReportingService.getNetworkSummary(pool, days);
        res.json({ success: true, data });
    }),
);

router.get(
    '/network/stock-by-store',
    asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const data = await warehouseReportingService.getStockByStore(pool);
        res.json({ success: true, data });
    }),
);

router.get(
    '/network/transfers',
    asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const { days = 7 } = DaysQuerySchema.parse(req.query);
        const [activity, byStore] = await Promise.all([
            warehouseReportingService.getTransferActivity(pool, days),
            warehouseReportingService.getTransfersByStore(pool, days),
        ]);
        res.json({ success: true, data: { activity, byStore } });
    }),
);

router.get(
    '/network/expiry',
    asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const data = await warehouseReportingService.getExpiryExposure(pool);
        res.json({ success: true, data });
    }),
);

router.get(
    '/network/quarantine',
    asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const data = await warehouseReportingService.getQuarantineStores(pool);
        res.json({ success: true, data });
    }),
);

export const warehouseReportingRoutes = router;
