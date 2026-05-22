/**
 * Customer Invoice Adjustment Controller
 *
 * GET  /api/customer-invoice-adjustments/invoice/:invoiceId/context
 * POST /api/customer-invoice-adjustments/adjust
 */

import type { Request, Response } from 'express';
import { pool as globalPool } from '../../db/pool.js';
import { customerInvoiceAdjustmentService } from './customerInvoiceAdjustmentService.js';
import {
    asyncHandler,
    ValidationError,
} from '../../middleware/errorHandler.js';
import { AdjustCustomerInvoiceSchema } from '../../../../shared/zod/customerInvoiceAdjustment.js';
import { z } from 'zod';

const UuidParam = z.object({ invoiceId: z.string().uuid() });

export const customerInvoiceAdjustmentController = {

    getContext: asyncHandler(async (req: Request, res: Response) => {
        const { invoiceId } = UuidParam.parse(req.params);
        const context = await customerInvoiceAdjustmentService.getInvoiceContext(globalPool, invoiceId);
        res.json({ success: true, data: context });
    }),

    adjust: asyncHandler(async (req: Request, res: Response) => {
        const input = AdjustCustomerInvoiceSchema.safeParse(req.body);
        if (!input.success) {
            throw new ValidationError(
                input.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
            );
        }

        const userId = req.user?.id;
        if (!userId) throw new ValidationError('User identity required');

        const result = await customerInvoiceAdjustmentService.adjust(globalPool, input.data, userId);
        res.status(201).json({ success: true, data: result });
    }),
};
