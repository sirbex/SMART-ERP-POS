// Delivery Note Controller - HTTP handlers for wholesale delivery notes
// All routes wrapped in asyncHandler, typed errors, Zod validation

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { deliveryNoteService } from './deliveryNoteService.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';

// ── Zod Schemas ────────────────────────────────────────────────

const CreateDeliveryNoteLineSchema = z.object({
  quotationItemId: z.string().uuid(),
  productId: z.string().uuid(),
  batchId: z.string().uuid().nullable().optional(),
  uomId: z.string().uuid().nullable().optional(),
  uomName: z.string().nullable().optional(),
  quantityDelivered: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative(),
  unitCost: z.number().nullable().optional(),
  description: z.string().optional(),
});

const CreateDeliveryNoteSchema = z.object({
  quotationId: z.string().uuid(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  warehouseNotes: z.string().optional(),
  deliveryAddress: z.string().optional(),
  driverName: z.string().optional(),
  vehicleNumber: z.string().optional(),
  lines: z.array(CreateDeliveryNoteLineSchema).min(1, 'At least one line is required'),
});

const UuidParamSchema = z.object({ id: z.string().uuid() });
const DnNumberParamSchema = z.object({ dnNumber: z.string().min(1) });

const ListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  quotationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'PICKED', 'POSTED']).optional(),
});

// ── Controller ─────────────────────────────────────────────────

export const deliveryNoteController = {
  /**
   * POST /api/delivery-notes
   * Create a DRAFT delivery note from a WHOLESALE quotation.
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId = req.user!.id;
    const data = CreateDeliveryNoteSchema.parse(req.body);

    const dn = await deliveryNoteService.createDeliveryNote(pool, {
      ...data,
      createdById: userId,
    });

    res.status(201).json({
      success: true,
      data: dn,
      message: `Delivery note ${dn.deliveryNoteNumber} created`,
    });
  }),

  /**
   * POST /api/delivery-notes/:id/post
   * Post Goods Issue (PGI) — moves stock, marks immutable. Accepts DRAFT or PICKED.
   */
  post: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId = req.user!.id;
    const { id } = UuidParamSchema.parse(req.params);

    const dn = await deliveryNoteService.postDeliveryNote(pool, id, userId);

    res.json({
      success: true,
      data: dn,
      message: `${dn.deliveryNoteNumber} — Goods Issue posted, stock deducted`,
    });
  }),

  /**
   * POST /api/delivery-notes/:id/pick
   * Confirm pick — validates stock availability, locks lines, transitions to PICKED.
   */
  pick: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId = req.user!.id;
    const { id } = UuidParamSchema.parse(req.params);

    const dn = await deliveryNoteService.pickDeliveryNote(pool, id, userId);

    res.json({
      success: true,
      data: dn,
      message: `${dn.deliveryNoteNumber} — Pick confirmed, ready for Goods Issue`,
    });
  }),

  /**
   * GET /api/delivery-notes/:id/pick-list
   * Get pick list with FEFO-suggested batches for warehouse staff.
   */
  pickList: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);

    const pickList = await deliveryNoteService.getPickList(pool, id);

    res.json({
      success: true,
      data: pickList,
    });
  }),

  /**
   * GET /api/delivery-notes/:id
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);

    const dn = await deliveryNoteService.getDeliveryNoteById(pool, id);
    res.json({ success: true, data: dn });
  }),

  /**
   * GET /api/delivery-notes/number/:dnNumber
   */
  getByNumber: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { dnNumber } = DnNumberParamSchema.parse(req.params);

    const dn = await deliveryNoteService.getDeliveryNoteByNumber(pool, dnNumber);
    res.json({ success: true, data: dn });
  }),

  /**
   * GET /api/delivery-notes
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { page, limit, ...filters } = ListFiltersSchema.parse(req.query);

    const result = await deliveryNoteService.listDeliveryNotes(pool, page, limit, filters);

    res.json({
      success: true,
      data: {
        data: result.deliveryNotes,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
    });
  }),

  /**
   * GET /api/delivery-notes/quotation/:id/fulfillment
   * Get delivery fulfillment status for a quotation.
   */
  fulfillment: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);

    const result = await deliveryNoteService.getQuotationFulfillment(pool, id);
    res.json({ success: true, data: result });
  }),

  /**
   * DELETE /api/delivery-notes/:id
   * Delete a DRAFT delivery note.
   */
  remove: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);

    await deliveryNoteService.deleteDeliveryNote(pool, id);
    res.json({ success: true, message: 'Delivery note deleted' });
  }),

  /**
   * POST /api/delivery-notes/:id/invoice
   * Create an invoice from a POSTED delivery note (wholesale invoicing path).
   */
  createInvoice: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId = req.user!.id;
    const { id } = UuidParamSchema.parse(req.params);

    // Dynamically import to avoid circular dependency
    const { invoiceFromDeliveryNote } = await import('./invoiceFromDN.js');
    const invoice = await invoiceFromDeliveryNote(pool, id, userId);

    res.status(201).json({
      success: true,
      data: invoice,
      message: `Invoice created from delivery note`,
    });
  }),
};
