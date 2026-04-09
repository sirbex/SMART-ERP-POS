/**
 * Quotation Controller
 * HTTP handlers for quotations system
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateQuotationInputSchema,
  UpdateQuotationInputSchema,
  ConvertQuotationInputSchema,
  CreateQuickQuoteInputSchema,
  QuotationListFiltersSchema,
} from '../../../../shared/zod/quotation.js';
import { quotationService } from './quotationService.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';

const UuidParamSchema = z.object({ id: z.string().uuid('ID must be a valid UUID') });
const UpdateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']),
  notes: z.string().optional(),
});

export const quotationController = {
  /**
   * POST /api/quotations
   */
  createQuotation: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId: string = req.user!.id;
    const validatedData = CreateQuotationInputSchema.parse(req.body);

    const result = await quotationService.createQuotation(pool, {
      quoteType: validatedData.quoteType || 'standard',
      customerId: validatedData.customerId || null,
      customerName: validatedData.customerName || null,
      customerPhone: validatedData.customerPhone || null,
      customerEmail: validatedData.customerEmail || null,
      description: validatedData.notes || null,
      validFrom: validatedData.validFrom || new Date().toLocaleDateString('en-CA'),
      validUntil: validatedData.validUntil || (() => {
        const d = new Date();
        d.setDate(d.getDate() + (validatedData.validityDays || 30));
        return d.toLocaleDateString('en-CA');
      })(),
      createdById: userId,
      fulfillmentMode: validatedData.fulfillmentMode || 'RETAIL',
      items: validatedData.items,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: `Quotation ${result.quotation.quoteNumber} created successfully`,
    });
  }),

  /**
   * POST /api/pos/quote
   */
  createQuickQuote: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId: string = req.user!.id;
    const validatedData = CreateQuickQuoteInputSchema.parse(req.body);

    const validFrom = new Date().toLocaleDateString('en-CA');
    const validityDays = validatedData.validityDays || 30;
    const validUntilDate = new Date();
    validUntilDate.setDate(validUntilDate.getDate() + validityDays);
    const validUntil = validUntilDate.toLocaleDateString('en-CA');

    const result = await quotationService.createQuotation(pool, {
      quoteType: 'quick',
      customerId: validatedData.customerId || null,
      customerName: validatedData.customerName || null,
      customerPhone: validatedData.customerPhone || null,
      description: validatedData.notes || 'Quick quote from POS',
      validFrom,
      validUntil,
      createdById: userId,
      items: validatedData.items,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: `Quick quote ${result.quotation.quoteNumber} created`,
    });
  }),

  /**
   * GET /api/quotations/:id
   */
  getQuotation: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);
    const quotation = await quotationService.getQuotationById(pool, id);

    if (!quotation) {
      throw new NotFoundError('Quotation');
    }

    res.json({ success: true, data: quotation });
  }),

  /**
   * GET /api/quotations/number/:quoteNumber
   */
  getQuotationByNumber: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { quoteNumber } = req.params;
    const quotation = await quotationService.getQuotationByNumber(pool, quoteNumber);

    if (!quotation) {
      throw new NotFoundError('Quotation');
    }

    res.json({ success: true, data: quotation });
  }),

  /**
   * GET /api/quotations
   */
  listQuotations: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;

    // Auto-expire overdue quotations on list load (SAP batch job equivalent)
    // Fire-and-forget — don't block the list response
    quotationService.expireOverdueQuotations(pool).catch(() => { /* non-critical */ });

    const filters = QuotationListFiltersSchema.parse({
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      customerId: req.query.customerId,
      status: req.query.status,
      quoteType: req.query.quoteType,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      searchTerm: req.query.searchTerm,
    });

    const result = await quotationService.listQuotations(pool, filters);
    res.json({ success: true, data: result });
  }),

  /**
   * PUT /api/quotations/:id/status
   */
  updateQuotationStatus: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);
    const { status, notes } = UpdateStatusSchema.parse(req.body);

    const quotation = await quotationService.updateQuotationStatus(pool, id, status, notes);
    res.json({
      success: true,
      data: quotation,
      message: `Quotation status updated to ${status}`,
    });
  }),

  /**
   * PUT /api/quotations/:id
   */
  updateQuotation: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);
    const validatedData = UpdateQuotationInputSchema.parse(req.body);
    const quotation = await quotationService.updateQuotation(pool, id, validatedData);
    res.json({ success: true, data: quotation, message: 'Quotation updated successfully' });
  }),

  /**
   * POST /api/quotations/:id/convert
   */
  convertQuotation: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId: string = req.user!.id;
    const { id } = UuidParamSchema.parse(req.params);
    const validatedData = ConvertQuotationInputSchema.parse(req.body);

    const result = await quotationService.convertQuotationToSale(pool, id, {
      paymentOption: validatedData.paymentOption,
      depositAmount: validatedData.depositAmount,
      depositMethod: validatedData.depositMethod === 'BANK_TRANSFER' ? 'MOBILE_MONEY' : validatedData.depositMethod,
      cashierId: userId,
      notes: validatedData.notes,
    });

    res.json({ success: true, data: result, message: 'Quotation converted to sale successfully' });
  }),

  /**
   * DELETE /api/quotations/:id
   */
  deleteQuotation: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);
    await quotationService.deleteQuotation(pool, id);
    res.json({ success: true, message: 'Quotation deleted successfully' });
  }),

  /**
   * PUT /api/quotations/:id/items/decisions
   * SAP-style item-level acceptance/rejection
   */
  updateItemDecisions: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);
    const ItemDecisionSchema = z.object({
      decisions: z.array(z.object({
        itemId: z.string().uuid(),
        status: z.enum(['ACCEPTED', 'REJECTED']),
        rejectionReason: z.string().optional(),
      })).min(1, 'At least one item decision is required'),
    });
    const { decisions } = ItemDecisionSchema.parse(req.body);
    const items = await quotationService.updateItemDecisions(pool, id, decisions);
    res.json({
      success: true,
      data: items,
      message: `Updated ${decisions.length} item decision(s)`,
    });
  }),

  /**
   * POST /api/quotations/expire
   * Auto-expire overdue quotations (SAP batch job equivalent)
   */
  expireOverdue: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const count = await quotationService.expireOverdueQuotations(pool);
    res.json({
      success: true,
      data: { expiredCount: count },
      message: count > 0 ? `Expired ${count} overdue quotation(s)` : 'No overdue quotations found',
    });
  }),
};
