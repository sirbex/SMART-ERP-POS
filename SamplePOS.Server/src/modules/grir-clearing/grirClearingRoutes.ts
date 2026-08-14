/**
 * GR/IR Clearing Routes
 *
 * SAP-standard API for GR/IR clearing account management.
 *
 * Endpoints:
 *   GET  /open                — MR11 work list (open items with filters)
 *   GET  /search?q=           — F4 search across PO/GR/supplier/invoice
 *   GET  /balance             — FBL3N clearing account balance summary
 *   GET  /purity              — MR11 purity diagnostic (GL split: pure vs polluted)
 *   GET  /match-candidates    — Preview auto-match candidates
 *   GET  /gr/:grId/items      — 3-way match item drill-down
 *   GET  /history/:poId       — Clearing history for a PO
 *   GET  /:poId               — Legacy: PO clearing status
 *   POST /clear               — MR11N manual clearing
 *   POST /auto-match          — F.13 automatic clearing
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../../rbac/middleware.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import * as grirService from './grirClearingService.js';

const router = Router();

const requireGrirRead = requireAnyPermission(['accounting.reconcile', 'purchasing.read', 'accounting.read']);
const requireGrirWrite = requirePermission('accounting.reconcile');

// ─── MR11 WORK LIST ─────────────────────────────────────────────────

/**
 * GET /api/grir-clearing/open
 * Open GR/IR clearing items with full filtering and pagination.
 * Query params: supplierId, poNumber, grNumber, status, dateFrom, dateTo, page, limit
 */
router.get('/open', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const result = await grirService.getOpenClearingItems({
    supplierId: req.query.supplierId as string | undefined,
    poNumber: req.query.poNumber as string | undefined,
    grNumber: req.query.grNumber as string | undefined,
    status: req.query.status as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
  }, req.tenantPool);
  res.json({ success: true, data: result });
}));

// ─── F4 SEARCH ──────────────────────────────────────────────────────

/**
 * GET /api/grir-clearing/search?q=PO-2026
 * Search across PO numbers, GR numbers, supplier names, invoice numbers.
 */
router.get('/search', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const q = req.query.q as string;
  if (!q || q.trim().length < 2) {
    return res.json({ success: true, data: [] });
  }
  const items = await grirService.searchClearingItems(q, req.tenantPool);
  res.json({ success: true, data: items });
}));

// ─── FBL3N BALANCE SUMMARY ─────────────────────────────────────────

/**
 * GET /api/grir-clearing/balance
 * Clearing account balance with breakdown of unmatched/matched/variance items.
 */
router.get('/balance', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const balance = await grirService.getClearingBalance(req.tenantPool);
  res.json({ success: true, data: balance });
}));

// ─── MR11 PURITY DIAGNOSTIC ────────────────────────────────────────

/**
 * GET /api/grir-clearing/purity
 * Diagnose GR/IR account (2150) for pollution by return/credit-note entries.
 * A non-zero pollutedBalance means historical entries should be migrated to
 * account 2160 (Supplier Return Clearing).
 */
router.get('/purity', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const diagnostic = await grirService.getGrirPurityDiagnostic(req.tenantPool);
  res.json({ success: true, data: diagnostic });
}));

// ─── AUTO-MATCH CANDIDATES PREVIEW ─────────────────────────────────

/**
 * GET /api/grir-clearing/match-candidates?supplierId=xxx&tolerancePercent=2
 * Preview which GR-Invoice pairs would be matched by auto-match.
 */
router.get('/match-candidates', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const toleranceRaw = req.query.tolerancePercent;
  const tolerancePercent =
    toleranceRaw != null && String(toleranceRaw).trim() !== ''
      ? parseFloat(String(toleranceRaw))
      : undefined;
  const candidates = await grirService.getMatchCandidates(
    {
      supplierId: req.query.supplierId as string | undefined,
      tolerancePercent: Number.isFinite(tolerancePercent) ? tolerancePercent : undefined,
    },
    req.tenantPool
  );
  res.json({ success: true, data: candidates });
}));

// ─── GR ITEM DRILL-DOWN ────────────────────────────────────────────

/**
 * GET /api/grir-clearing/gr/:grId/items
 * 3-way match: GR line items vs PO line items with variance per line.
 */
router.get('/gr/:grId/items', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const items = await grirService.getGrItemDetails(req.params.grId, req.tenantPool);
  res.json({ success: true, data: items });
}));

// ─── PO CLEARING HISTORY ───────────────────────────────────────────

/**
 * GET /api/grir-clearing/history/:poId
 * Get all clearing records for a specific PO.
 */
router.get('/history/:poId', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const history = await grirService.getClearingHistory(req.params.poId, req.tenantPool);
  res.json({ success: true, data: history });
}));

// ─── GL RESIDUAL WORKLIST (true 2150 by document) ───────────────────
// IMPORTANT: declared BEFORE /:poId so "residuals" is not captured as a UUID/po id.

/**
 * GET /api/grir-clearing/residuals
 * Ledger residuals on 2150 grouped by ReferenceNumber (finance clear list).
 */
router.get('/residuals', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
  const minAbs = req.query.minAbs ? parseFloat(String(req.query.minAbs)) : undefined;
  const result = await grirService.getGlResiduals({ limit, minAbs }, req.tenantPool);
  res.json({ success: true, data: result });
}));

/**
 * POST /api/grir-clearing/clear-residual
 * Clear a 2150 residual WITHOUT re-posting AP (safe after invoice already posted).
 * Body: { referenceNumber, method, amount?, date?, notes? }
 * method: TO_PRICE_VARIANCE | TO_RETURN_CLEARING | RECLASS_FROM_EXPENSE
 */
router.post('/clear-residual', authenticate, requireGrirWrite, asyncHandler(async (req, res) => {
  const { referenceNumber, method, amount, date, notes } = req.body || {};
  if (!referenceNumber || !method) {
    throw new ValidationError('referenceNumber and method are required');
  }

  const result = await grirService.clearGlResidual({
    referenceNumber: String(referenceNumber),
    method,
    userId: req.user!.id,
    amount: amount != null ? Number(amount) : undefined,
    date,
    notes: notes != null ? String(notes) : undefined,
  }, req.tenantPool);

  res.json({ success: true, data: result });
}));

// ─── LEGACY: PO STATUS ─────────────────────────────────────────────

/**
 * GET /api/grir-clearing/:poId
 * Backward-compatible: clearing status for a specific PO.
 */
router.get('/:poId', authenticate, requireGrirRead, asyncHandler(async (req, res) => {
  const record = await grirService.getGrirStatus(req.params.poId, req.tenantPool);
  res.json({ success: true, data: record });
}));

// ─── MANUAL CLEARING (MR11N) ───────────────────────────────────────

/**
 * POST /api/grir-clearing/clear
 * Manually clear a specific GR against a specific invoice.
 * Body: { grId, invoiceId, date? }
 *
 * GL: DR GR/IR Clearing 2150, CR AP 2100, +/- Price Variance 5020
 * Prefer billing path first. Use /clear-residual when AP is already posted.
 */
router.post('/clear', authenticate, requireGrirWrite, asyncHandler(async (req, res) => {
  const { grId, invoiceId, date } = req.body;
  if (!grId || !invoiceId) {
    throw new ValidationError('grId and invoiceId are required');
  }

  const result = await grirService.clearItem({
    grId,
    invoiceId,
    userId: req.user!.id,
    date,
  }, req.tenantPool);

  res.json({ success: true, data: result });
}));

// ─── AUTOMATIC CLEARING (F.13) ─────────────────────────────────────

/**
 * POST /api/grir-clearing/auto-match
 * Automatically match GRs to invoices (multi-path link SSOT).
 * Body: { supplierId?, tolerancePercent? }
 *
 * SAP F.13: exact first, then within tolerance (default 2% — same as preview UI).
 */
router.post('/auto-match', authenticate, requireGrirWrite, asyncHandler(async (req, res) => {
  const { supplierId, tolerancePercent } = req.body || {};
  const tol =
    tolerancePercent != null && String(tolerancePercent).trim() !== ''
      ? parseFloat(String(tolerancePercent))
      : undefined;

  const result = await grirService.autoMatch({
    supplierId,
    tolerancePercent: Number.isFinite(tol) ? tol : undefined,
    userId: req.user!.id,
  }, req.tenantPool);

  res.json({ success: true, data: result });
}));

export const grirClearingRoutes = router;
