/**
 * Documents routes — central PDF rendering endpoint.
 *
 * GET /api/documents/:type/:id            → stream PDF (download)
 * GET /api/documents/:type/:id/preview    → stream PDF inline (for iframe preview)
 *
 * Query params:
 *   paperSize=A4|A5|LETTER|RECEIPT_80MM|RECEIPT_58MM   (default A4)
 *   variant=final|preview                              (default final)
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Pool } from 'pg';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { authenticate } from '../../middleware/auth.js';
import { render, type DocumentType } from './documentRenderer.js';

const SUPPORTED_TYPES = [
    'INVOICE',
    'RECEIPT',
    'QUOTATION',
    'PURCHASE_ORDER',
    'GOODS_RECEIPT',
    'DELIVERY_NOTE',
    'CREDIT_NOTE',
    'CUSTOMER_STATEMENT',
    'SUPPLIER_STATEMENT',
    'PAYMENT_VOUCHER',
    'PROFIT_LOSS',
    'BALANCE_SHEET',
    'TRIAL_BALANCE',
    'CASH_FLOW',
    'GENERAL_LEDGER',
    'AGED_RECEIVABLES',
    'AGED_PAYABLES',
] as const;

const ParamSchema = z.object({
    type: z.enum(SUPPORTED_TYPES),
    id: z.string().min(1),
});

const QuerySchema = z.object({
    paperSize: z.enum(['A4', 'A5', 'LETTER', 'RECEIPT_80MM', 'RECEIPT_58MM']).optional(),
    variant: z.enum(['final', 'preview']).optional(),
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD')
        .optional(),
    endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD')
        .optional(),
});

export function createDocumentRoutes(globalPool: Pool): Router {
    const router = Router();

    async function streamDocument(
        req: Request,
        res: Response,
        disposition: 'attachment' | 'inline',
    ): Promise<void> {
        const { type, id } = ParamSchema.parse(req.params);
        const query = QuerySchema.parse(req.query);
        const pool = req.tenantPool || globalPool;

        res.setHeader('Content-Type', 'application/pdf');

        const result = await render(
            pool,
            {
                type: type as DocumentType,
                id,
                paperSize: query.paperSize,
                variant: query.variant ?? 'final',
                startDate: query.startDate,
                endDate: query.endDate,
            },
            res,
        );

        res.setHeader(
            'Content-Disposition',
            `${disposition}; filename="${result.filename}"`,
        );
    }

    router.get(
        '/:type/:id/preview',
        authenticate,
        asyncHandler(async (req, res) => {
            await streamDocument(req, res, 'inline');
        }),
    );

    router.get(
        '/:type/:id',
        authenticate,
        asyncHandler(async (req, res) => {
            await streamDocument(req, res, 'attachment');
        }),
    );

    return router;
}
