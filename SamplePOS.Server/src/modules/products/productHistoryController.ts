// Product History Controller - HTTP handling and validation

import type { Request, Response } from 'express';
import { z } from 'zod';
import { productHistoryService } from './productHistoryService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { pool as globalPool } from '../../db/pool.js';

const QuerySchema = z
  .object({
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 100)),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    type: z
      .enum([
        'GOODS_RECEIPT',
        'SALE',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'RETURN',
        'DAMAGE',
        'EXPIRY',
      ])
      .optional(),
  })
  .strict();

export const getProductHistory = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = req.params;
  const q = QuerySchema.parse(req.query);

  const result = await productHistoryService.getProductHistory(
    id,
    {
      page: q.page,
      limit: q.limit,
      startDate: q.startDate,
      endDate: q.endDate,
      type: q.type,
    },
    pool
  );

  res.json({
    success: true,
    data: result.items,
    summary: result.summary,
    pagination: result.pagination,
  });
});
