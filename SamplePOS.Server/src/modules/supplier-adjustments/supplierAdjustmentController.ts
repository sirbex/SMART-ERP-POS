/**
 * Supplier Adjustment Controller
 *
 * Two endpoints:
 *  GET  /api/supplier-adjustments/invoice/:invoiceId/context
 *  POST /api/supplier-adjustments/adjust
 */

import type { Request, Response } from 'express';
import { pool as globalPool } from '../../db/pool.js';
import { supplierAdjustmentService } from './supplierAdjustmentService.js';
import {
    asyncHandler,
    NotFoundError,
    ValidationError,
} from '../../middleware/errorHandler.js';
import { AdjustSupplierInvoiceSchema } from '../../../../shared/zod/supplierAdjustment.js';
import { z } from 'zod';

const UuidParam = z.object({ invoiceId: z.string().uuid() });

export const supplierAdjustmentController = {

    /**
     * GET /api/supplier-adjustments/invoice/:invoiceId/context
     * Returns invoice details + returnable GRN lines + suggested intent.
     */
    getContext: asyncHandler(async (req: Request, res: Response) => {
        const { invoiceId } = UuidParam.parse(req.params);
        const context = await supplierAdjustmentService.getInvoiceContext(globalPool, invoiceId);
        res.json({ success: true, data: context });
    }),

    /**
     * POST /api/supplier-adjustments/adjust
     * Execute the adjustment (RETURN or PRICE_CORRECTION).
     */
    adjust: asyncHandler(async (req: Request, res: Response) => {
        const input = AdjustSupplierInvoiceSchema.safeParse(req.body);
        if (!input.success) {
            throw new ValidationError(
                input.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
            );
        }

        const userId = req.user?.id;
        if (!userId) throw new ValidationError('User identity required');

        const result = await supplierAdjustmentService.adjust(globalPool, input.data, userId);
        res.status(201).json({ success: true, data: result });
    }),
};
