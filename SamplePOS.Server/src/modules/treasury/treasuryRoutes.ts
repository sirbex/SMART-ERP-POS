/**
 * Treasury Document routes — /api/treasury (ADR-003 Phase 1A)
 */

import { Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import { TREASURY_DOCUMENT_TYPES } from '@shared/treasury/index.js';
import * as treasuryService from './treasuryService.js';
import * as depositWorksheetService from './depositWorksheetService.js';
import * as treasuryTransferService from './treasuryTransferService.js';
import * as pettyCashService from './pettyCashService.js';

const router = Router();

const LineSchema = z.object({
  lineType: z
    .enum(['RECEIPT_APPLICATION', 'ACCOUNT_MOVE', 'ADJUSTMENT', 'FEE', 'SHORTAGE', 'OVERAGE'])
    .optional(),
  accountCode: z.string().min(1),
  description: z.string().optional(),
  debitAmount: z.number().nonnegative().optional(),
  creditAmount: z.number().nonnegative().optional(),
  amount: z.number().nonnegative().optional(),
  sourceReceiptId: z.string().uuid().optional(),
  sourcePaymentId: z.string().uuid().optional(),
  sourceSessionMovementId: z.string().uuid().optional(),
  memo: z.string().optional(),
});

const CreateSchema = z.object({
  documentType: z.enum(TREASURY_DOCUMENT_TYPES as unknown as [string, ...string[]]),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currencyCode: z.string().length(3).optional(),
  memo: z.string().optional(),
  fromAccountCode: z.string().optional(),
  toAccountCode: z.string().optional(),
  bankAccountId: z.string().uuid().optional(),
  depositReference: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  overageAmount: z.number().nonnegative().optional(),
  shortageAmount: z.number().nonnegative().optional(),
  lines: z.array(LineSchema).min(1),
});

const UpdateSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  memo: z.string().nullable().optional(),
  fromAccountCode: z.string().nullable().optional(),
  toAccountCode: z.string().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  depositReference: z.string().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  overageAmount: z.number().nonnegative().optional(),
  shortageAmount: z.number().nonnegative().optional(),
  lines: z.array(LineSchema).min(1).optional(),
  expectedRowVersion: z.number().int().positive(),
});

const DepositWorksheetSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankAccountId: z.string().uuid(),
  depositReference: z.string().optional(),
  memo: z.string().optional(),
  shortageAmount: z.number().nonnegative().optional(),
  overageAmount: z.number().nonnegative().optional(),
  requiresApproval: z.boolean().optional(),
  receipts: z
    .array(
      z.object({
        sourceType: z.enum(['AR_CUSTOMER_PAYMENT', 'INVOICE_PAYMENT', 'CUSTOMER_DEPOSIT']),
        sourceId: z.string().uuid(),
        amount: z.number().positive(),
      }),
    )
    .min(1),
});

const TransferSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromAccountCode: z.string().min(1),
  toAccountCode: z.string().min(1),
  amount: z.number().positive(),
  memo: z.string().optional(),
  depositReference: z.string().optional(),
  bankAccountId: z.string().uuid().optional(),
  documentType: z
    .enum([
      'TREASURY_TRANSFER',
      'CASH_WITHDRAWAL',
      'CASH_DEPOSIT',
      'CARD_SETTLEMENT',
      'MOBILE_MONEY_SETTLEMENT',
    ])
    .optional(),
  requiresApproval: z.boolean().optional(),
  postImmediately: z.boolean().optional(),
});

const PettyCashSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  operation: z.enum(['FUND', 'REPLENISH', 'EXPENSE']),
  amount: z.number().positive(),
  contraAccountCode: z.string().optional(),
  memo: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  postImmediately: z.boolean().optional(),
});

router.use(authenticate);

router.get(
  '/enabled',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const enabled = await treasuryService.isEnabled(pool);
    res.json({ success: true, data: { enabled } });
  }),
);

router.get(
  '/unsettled-receipts',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const clearingAccountCode = req.query.clearingAccountCode
      ? String(req.query.clearingAccountCode)
      : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const items = await depositWorksheetService.listUnsettledReceipts(pool, {
      clearingAccountCode,
      limit,
    });
    res.json({ success: true, data: { items } });
  }),
);

router.get(
  '/deposit-reconciliation',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await depositWorksheetService.getDepositReconciliation(pool);
    res.json({ success: true, data });
  }),
);

router.post(
  '/deposit-worksheets',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const parsed = DepositWorksheetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const pool = req.tenantPool || globalPool;
    const doc = await depositWorksheetService.createDepositWorksheet(pool, {
      ...parsed.data,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: doc });
  }),
);

router.get(
  '/liquidity-accounts',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const items = await treasuryTransferService.listLiquidityAccounts(pool);
    res.json({ success: true, data: { items } });
  }),
);

router.post(
  '/transfers',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const parsed = TransferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const pool = req.tenantPool || globalPool;
    const doc = await treasuryTransferService.createTreasuryTransfer(pool, {
      ...parsed.data,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: doc });
  }),
);

router.get(
  '/petty-cash/balances',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await pettyCashService.getPettyCashBalance(pool);
    res.json({ success: true, data });
  }),
);

router.post(
  '/petty-cash',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const parsed = PettyCashSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const pool = req.tenantPool || globalPool;
    const doc = await pettyCashService.createPettyCashDocument(pool, {
      ...parsed.data,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: doc });
  }),
);

router.get(
  '/documents',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? '20'), 10) || 20;
    const status = req.query.status ? String(req.query.status) : undefined;
    const documentType = req.query.documentType ? String(req.query.documentType) : undefined;
    const result = await treasuryService.listDocuments(pool, {
      page,
      limit,
      status,
      documentType,
    });
    res.json({ success: true, data: result });
  }),
);

router.get(
  '/documents/:id',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const doc = await treasuryService.getDocument(pool, req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Treasury Document not found' });
    }
    res.json({ success: true, data: doc });
  }),
);

router.post(
  '/documents',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const pool = req.tenantPool || globalPool;
    const doc = await treasuryService.createDraft(pool, {
      ...parsed.data,
      documentType: parsed.data.documentType as import('@shared/treasury/index.js').TreasuryDocumentType,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: doc });
  }),
);

router.patch(
  '/documents/:id',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const pool = req.tenantPool || globalPool;
    const doc = await treasuryService.updateDraft(pool, req.params.id, {
      ...parsed.data,
      actorUserId: req.user!.id,
    });
    res.json({ success: true, data: doc });
  }),
);

router.post(
  '/documents/:id/submit',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const doc = await treasuryService.submit(pool, req.params.id, req.user!.id);
    res.json({ success: true, data: doc });
  }),
);

router.post(
  '/documents/:id/approve',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const doc = await treasuryService.approve(pool, req.params.id, req.user!.id);
    res.json({ success: true, data: doc });
  }),
);

router.post(
  '/documents/:id/reject',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const doc = await treasuryService.reject(pool, req.params.id, req.user!.id, reason);
    res.json({ success: true, data: doc });
  }),
);

router.post(
  '/documents/:id/post',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const doc = await treasuryService.post(pool, req.params.id, req.user!.id);
    res.json({ success: true, data: doc });
  }),
);

router.post(
  '/documents/:id/reverse',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const result = await treasuryService.reverse(pool, req.params.id, req.user!.id, reason);
    res.json({ success: true, data: result });
  }),
);

export { router as treasuryRoutes };
