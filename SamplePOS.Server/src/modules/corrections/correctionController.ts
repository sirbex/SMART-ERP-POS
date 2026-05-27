/**
 * Phase D — correction eligibility controller.
 */

import type { Request, Response } from 'express';
import { pool as globalPool } from '../../db/pool.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import {
    CorrectionEligibilityQuerySchema,
    CorrectionPreviewBodySchema,
} from '../../../../shared/zod/correction.js';
import { correctionEligibilityService } from './correctionEligibilityService.js';
import { supplierReassignmentService } from './supplierReassignmentService.js';
import {
    SupplierReassignmentBodySchema,
    SupplierReassignmentExecuteSchema,
} from '../../../../shared/zod/supplierReassignment.js';

export const correctionController = {

    getEligibility: asyncHandler(async (req: Request, res: Response) => {
        const query = CorrectionEligibilityQuerySchema.safeParse(req.query);
        if (!query.success) {
            throw new ValidationError(
                query.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
            );
        }

        const pool = req.tenantPool ?? globalPool;
        const data = await correctionEligibilityService.getEligibility(
            pool,
            query.data.documentType,
            query.data.documentId,
        );
        res.json({ success: true, data });
    }),

    previewCorrection: asyncHandler(async (req: Request, res: Response) => {
        const body = CorrectionPreviewBodySchema.safeParse(req.body);
        if (!body.success) {
            throw new ValidationError(
                body.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
            );
        }

        const pool = req.tenantPool ?? globalPool;
        const data = await correctionEligibilityService.previewCorrection(
            pool,
            body.data.documentType,
            body.data.documentId,
            body.data.correctionKind,
        );
        res.json({ success: true, data });
    }),

    previewSupplierReassignment: asyncHandler(async (req: Request, res: Response) => {
        const body = SupplierReassignmentBodySchema.safeParse(req.body);
        if (!body.success) {
            throw new ValidationError(
                body.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
            );
        }
        const pool = req.tenantPool ?? globalPool;
        const data = await supplierReassignmentService.preview(pool, body.data);
        res.json({ success: true, data });
    }),

    executeSupplierReassignment: asyncHandler(async (req: Request, res: Response) => {
        const body = SupplierReassignmentExecuteSchema.safeParse(req.body);
        if (!body.success) {
            throw new ValidationError(
                body.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
            );
        }
        const userId = req.user?.id;
        if (!userId) throw new ValidationError('User identity required');

        const pool = req.tenantPool ?? globalPool;
        const data = await supplierReassignmentService.execute(pool, body.data, userId);
        res.status(201).json({ success: true, data });
    }),
};
