/**
 * GR/IR Clearing Routes
 *
 * SAP-standard API for GR/IR clearing account management.
 *
 * Endpoints:
 *   GET  /open                — MR11 work list (open items with filters)
 *   GET  /search?q=           — F4 search across PO/GR/supplier/invoice
 *   GET  /balance             — FBL3N clearing account balance summary
 *   GET  /match-candidates    — Preview auto-match candidates
 *   GET  /gr/:grId/items      — 3-way match item drill-down
 *   GET  /history/:poId       — Clearing history for a PO
 *   GET  /:poId               — Legacy: PO clearing status
 *   POST /clear               — MR11N manual clearing
 *   POST /auto-match          — F.13 automatic clearing
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import * as grirService from './grirClearingService.js';

const router = Router();

// ─── MR11 WORK LIST ─────────────────────────────────────────────────

/**
 * GET /api/grir-clearing/open
 * Open GR/IR clearing items with full filtering and pagination.
 * Query params: supplierId, poNumber, grNumber, status, dateFrom, dateTo, page, limit
 */
router.get('/open', authenticate, asyncHandler(async (req, res) => {
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
router.get('/search', authenticate, asyncHandler(async (req, res) => {
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
router.get('/balance', authenticate, asyncHandler(async (req, res) => {
  const balance = await grirService.getClearingBalance(req.tenantPool);
  res.json({ success: true, data: balance });
}));

// ─── AUTO-MATCH CANDIDATES PREVIEW ─────────────────────────────────

/**
 * GET /api/grir-clearing/match-candidates?supplierId=xxx
 * Preview which GR-Invoice pairs would be matched by auto-match.
 */
router.get('/match-candidates', authenticate, asyncHandler(async (req, res) => {
  const candidates = await grirService.getMatchCandidates(
    { supplierId: req.query.supplierId as string | undefined },
    req.tenantPool
  );
  res.json({ success: true, data: candidates });
}));

// ─── GR ITEM DRILL-DOWN ────────────────────────────────────────────

/**
 * GET /api/grir-clearing/gr/:grId/items
 * 3-way match: GR line items vs PO line items with variance per line.
 */
router.get('/gr/:grId/items', authenticate, asyncHandler(async (req, res) => {
  const items = await grirService.getGrItemDetails(req.params.grId, req.tenantPool);
  res.json({ success: true, data: items });
}));

// ─── PO CLEARING HISTORY ───────────────────────────────────────────

/**
 * GET /api/grir-clearing/history/:poId
 * Get all clearing records for a specific PO.
 */
router.get('/history/:poId', authenticate, asyncHandler(async (req, res) => {
  const history = await grirService.getClearingHistory(req.params.poId, req.tenantPool);
  res.json({ success: true, data: history });
}));

// ─── LEGACY: PO STATUS ─────────────────────────────────────────────

/**
 * GET /api/grir-clearing/:poId
 * Backward-compatible: clearing status for a specific PO.
 */
router.get('/:poId', authenticate, asyncHandler(async (req, res) => {
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
 */
router.post('/clear', authenticate, asyncHandler(async (req, res) => {
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
 * Automatically match all GRs to invoices on the same PO.
 * Body: { supplierId?, tolerancePercent? }
 *
 * SAP F.13: exact matches first, then within tolerance (default 5%).
 */
router.post('/auto-match', authenticate, asyncHandler(async (req, res) => {
  const { supplierId, tolerancePercent } = req.body || {};

  const result = await grirService.autoMatch({
    supplierId,
    tolerancePercent,
    userId: req.user!.id,
  }, req.tenantPool);

  res.json({ success: true, data: result });
}));

export const grirClearingRoutes = router;
