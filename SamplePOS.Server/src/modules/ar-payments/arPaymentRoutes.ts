import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import * as arPaymentService from './arPaymentService.js';
import { pool as globalPool } from '../../db/pool.js';

const router = Router();
router.use(authenticate);

const p = (req: { tenantPool?: typeof globalPool }) => req.tenantPool || globalPool;

const CreatePaymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.union([z.number().positive(), z.string().transform(Number)]),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  autoAllocate: z.boolean().optional(),
  allocationType: z.enum(['MANUAL', 'FIFO', 'EXACT', 'DUE_DATE']).optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amount: z.union([z.number().positive(), z.string().transform(Number)]),
      }),
    )
    .optional(),
});

const AllocateSchema = z.object({
  allocationType: z.enum(['MANUAL', 'FIFO', 'EXACT', 'DUE_DATE']).optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amount: z.union([z.number().positive(), z.string().transform(Number)]),
      }),
    )
    .default([]),
});

router.post(
  '/',
  requirePermission('customers.update'),
  asyncHandler(async (req, res) => {
    const body = CreatePaymentSchema.parse(req.body);
    const result = await arPaymentService.createCustomerPayment(p(req), {
      customerId: body.customerId,
      amount: Number(body.amount),
      paymentDate: body.paymentDate,
      paymentMethod: body.paymentMethod,
      reference: body.reference,
      notes: body.notes,
      createdById: req.user!.id,
      autoAllocate: body.autoAllocate,
      allocationType: body.allocationType,
      allocations: body.allocations?.map((a) => ({
        invoiceId: a.invoiceId,
        amount: Number(a.amount),
      })),
    });
    res.status(201).json({ success: true, data: result });
  }),
);

router.get(
  '/',
  requirePermission('customers.read'),
  asyncHandler(async (req, res) => {
    const customerId = req.query.customerId
      ? z.string().uuid().parse(req.query.customerId)
      : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const rows = await arPaymentService.listCustomerPayments(p(req), {
      customerId,
      search,
    });
    res.json({ success: true, data: rows });
  }),
);

router.get(
  '/customer/:customerId/open-invoices',
  requirePermission('customers.read'),
  asyncHandler(async (req, res) => {
    const customerId = z.string().uuid().parse(req.params.customerId);
    const rows = await arPaymentService.listOpenInvoices(p(req), customerId);
    res.json({ success: true, data: rows });
  }),
);

router.get(
  '/:paymentId',
  requirePermission('customers.read'),
  asyncHandler(async (req, res) => {
    const paymentId = z.string().uuid().parse(req.params.paymentId);
    const data = await arPaymentService.getPaymentWithAllocations(p(req), paymentId);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }
    res.json({ success: true, data });
  }),
);

router.post(
  '/:paymentId/allocate',
  requirePermission('customers.update'),
  asyncHandler(async (req, res) => {
    const paymentId = z.string().uuid().parse(req.params.paymentId);
    const body = AllocateSchema.parse(req.body);
    const result = await arPaymentService.allocatePayment(
      p(req),
      paymentId,
      body.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: Number(a.amount) })),
      {
        allocationType: body.allocationType,
        createdById: req.user!.id,
      },
    );
    res.json({ success: true, data: result });
  }),
);

router.post(
  '/allocations/:allocationId/reverse',
  requirePermission('customers.update'),
  asyncHandler(async (req, res) => {
    const allocationId = z.string().uuid().parse(req.params.allocationId);
    const result = await arPaymentService.reverseAllocation(p(req), allocationId, req.user!.id);
    res.json({ success: true, data: result });
  }),
);

export const arPaymentRoutes = router;
