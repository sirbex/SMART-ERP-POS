// Product History Controller - HTTP handling and validation

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { productHistoryService } from './productHistoryService.js';

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
    startDate: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    endDate: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
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

export async function getProductHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const q = QuerySchema.parse(req.query);

    const result = await productHistoryService.getProductHistory(id, {
      page: q.page,
      limit: q.limit,
      startDate: q.startDate,
      endDate: q.endDate,
      type: q.type,
    });

    res.json({
      success: true,
      data: result.items,
      summary: result.summary,
      pagination: result.pagination,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid query parameters', details: error.errors });
      return;
    }
    next(error);
  }
}
