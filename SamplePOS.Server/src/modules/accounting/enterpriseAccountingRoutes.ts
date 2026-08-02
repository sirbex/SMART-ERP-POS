/**
 * Enterprise Accounting Routes
 *
 * API endpoints for enterprise-grade accounting features:
 *   - Fiscal year close
 *   - Tax engine
 *   - GL reconciliation
 *   - Currency revaluation
 *   - GL integrity audit
 *   - Aged receivables/payables
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { FiscalYearCloseService } from '../../services/fiscalYearCloseService.js';
import { TaxEngine } from '../../services/taxEngine.js';
import { DocumentTaxService } from '../../services/documentTaxService.js';
import {
  loadActiveTaxDefinitions,
  loadTaxPreviewSnapshot,
  listProductTaxMappings,
  replaceProductTaxMappings,
} from '../../services/documentTaxRepository.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { GLReconciliationService } from '../../services/glReconciliationService.js';
import { CurrencyRevaluationService } from '../../services/currencyRevaluationService.js';
import { GLIntegrityChecker } from '../../services/glIntegrityChecker.js';
import { AgedBalanceService } from '../../services/agedBalanceService.js';
import { getBusinessDate, getBusinessYear } from '../../utils/dateRange.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// FISCAL YEAR CLOSE
// =============================================================================

/** GET /api/enterprise-accounting/fiscal-year/status?year=2025 */
router.get('/fiscal-year/status', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year as string) || getBusinessYear();
  const status = await FiscalYearCloseService.getStatus(year, req.tenantPool);
  res.json({ success: true, data: status });
}));

/** POST /api/enterprise-accounting/fiscal-year/close */
router.post('/fiscal-year/close',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const { year, closingDate } = req.body;
    if (!year || typeof year !== 'number') {
      return res.status(400).json({ success: false, error: 'year is required (number)' });
    }
    const result = await FiscalYearCloseService.closeFiscalYear(
      {
        fiscalYear: year,
        closingDate: closingDate || `${year}-12-31`,
        userId: req.user!.id,
      },
      req.tenantPool
    );
    res.json({ success: true, data: result });
  })
);

// =============================================================================
// TAX ENGINE
// =============================================================================

/** GET /api/enterprise-accounting/taxes — List active tax definitions */
router.get('/taxes', asyncHandler(async (req, res) => {
  const scope = req.query.scope as string | undefined;
  const validScopes = ['SALE', 'PURCHASE', 'BOTH'];
  const taxScope = scope && validScopes.includes(scope)
    ? (scope as 'SALE' | 'PURCHASE' | 'BOTH')
    : undefined;
  const taxes = await loadActiveTaxDefinitions(req.tenantPool!, taxScope);
  res.json({ success: true, data: taxes });
}));

/** POST /api/enterprise-accounting/taxes/compute — Compute taxes for a line item */
router.post('/taxes/compute', asyncHandler(async (req, res) => {
  const { unitPrice, quantity, taxIds } = req.body;
  if (unitPrice == null || quantity == null || !Array.isArray(taxIds)) {
    return res.status(400).json({
      success: false,
      error: 'unitPrice, quantity, and taxIds[] are required',
    });
  }

  const qty = Number(quantity);
  const price = Number(unitPrice);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) {
    return res.status(400).json({
      success: false,
      error: 'unitPrice and quantity must be numbers',
    });
  }

  const allTaxes = await loadActiveTaxDefinitions(req.tenantPool!);
  const applicable = allTaxes.filter(t => taxIds.includes(t.id));
  // TaxEngine amount is line net (qty × unit); quantity is for FIXED per-unit taxes
  const lineNet = price * qty;
  const result = TaxEngine.compute(lineNet, applicable, qty);
  res.json({ success: true, data: result });
}));

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/enterprise-accounting/taxes/product/:productId/mappings
 * Raw product_tax_mappings (not full DocumentTax determination).
 * Must be registered before /taxes/product/:productId.
 */
router.get(
  '/taxes/product/:productId/mappings',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.productId)) {
      throw new ValidationError('productId must be a UUID');
    }
    const taxes = await listProductTaxMappings(req.tenantPool!, req.params.productId);
    res.json({
      success: true,
      data: { productId: req.params.productId, taxes },
    });
  }),
);

/**
 * PUT /api/enterprise-accounting/taxes/product/:productId/mappings
 * Full replace of product_tax_mappings. Requires accounting.manage.
 */
router.put(
  '/taxes/product/:productId/mappings',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.productId)) {
      throw new ValidationError('productId must be a UUID');
    }
    const taxIds = req.body?.taxIds;
    if (!Array.isArray(taxIds)) {
      return res.status(400).json({
        success: false,
        error: 'taxIds[] is required (use [] to clear mappings)',
      });
    }
    if (!taxIds.every((id: unknown) => typeof id === 'string' && UUID_RE.test(id))) {
      return res.status(400).json({ success: false, error: 'taxIds must be string UUIDs' });
    }

    try {
      const taxes = await UnitOfWork.run(req.tenantPool!, async (client) =>
        replaceProductTaxMappings(client, req.params.productId, taxIds as string[]),
      );
      res.json({
        success: true,
        data: {
          productId: req.params.productId,
          taxes,
          offlineSnapshotHint: 'refresh_tax_snapshot',
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('Product not found') || msg.startsWith('Invalid or inactive')) {
        throw new ValidationError(msg);
      }
      // PG invalid uuid / etc.
      const code = (err as { code?: string })?.code;
      if (code === '22P02') {
        throw new ValidationError('Invalid UUID in productId or taxIds');
      }
      throw err;
    }
  }),
);

/** GET /api/enterprise-accounting/taxes/product/:productId — Safe determination hierarchy */
router.get('/taxes/product/:productId', asyncHandler(async (req, res) => {
  const customerId = (req.query.customerId as string) || null;
  const scope = (req.query.scope as string) || 'SALE';
  const validScopes = ['SALE', 'PURCHASE', 'BOTH'];
  const taxScope = validScopes.includes(scope)
    ? (scope as 'SALE' | 'PURCHASE' | 'BOTH')
    : 'SALE' as const;
  const taxes = await DocumentTaxService.determineApplicableTaxes(
    req.tenantPool!,
    req.params.productId,
    customerId,
    taxScope,
    { applyTenantDefaultWhenUnresolved: false },
  );
  res.json({ success: true, data: taxes });
}));

/**
 * GET /api/enterprise-accounting/taxes/snapshot
 * Offline / POS client preview cache: definitions, mappings, exemptions, tenant flags.
 */
router.get('/taxes/snapshot', asyncHandler(async (req, res) => {
  const scope = (req.query.scope as string) || 'SALE';
  const validScopes = ['SALE', 'PURCHASE', 'BOTH'];
  const taxScope = validScopes.includes(scope)
    ? (scope as 'SALE' | 'PURCHASE' | 'BOTH')
    : 'SALE' as const;
  const snapshot = await loadTaxPreviewSnapshot(req.tenantPool!, taxScope);
  res.json({ success: true, data: snapshot });
}));

// =============================================================================
// GL RECONCILIATION
// =============================================================================

/** GET /api/enterprise-accounting/reconciliation/unreconciled?accountCode=1200 */
router.get('/reconciliation/unreconciled', asyncHandler(async (req, res) => {
  const accountCode = req.query.accountCode as string;
  if (!accountCode) {
    return res.status(400).json({ success: false, error: 'accountCode is required' });
  }
  const options = {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  };
  const items = await GLReconciliationService.getUnreconciledItems(
    accountCode, options, req.tenantPool
  );
  res.json({ success: true, data: items });
}));

/** POST /api/enterprise-accounting/reconciliation/reconcile */
router.post('/reconciliation/reconcile',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const { entryIds, writeOffAmount, writeOffAccountCode } = req.body;
    if (!Array.isArray(entryIds) || entryIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'entryIds[] with at least 2 entries is required',
      });
    }
    const result = await GLReconciliationService.reconcileEntries(
      entryIds,
      req.user!.id,
      writeOffAmount,
      writeOffAccountCode,
      req.tenantPool
    );
    res.json({ success: true, data: result });
  })
);

/** GET /api/enterprise-accounting/reconciliation/suggestions?accountCode=1200 */
router.get('/reconciliation/suggestions', asyncHandler(async (req, res) => {
  const accountCode = req.query.accountCode as string;
  if (!accountCode) {
    return res.status(400).json({ success: false, error: 'accountCode is required' });
  }
  const suggestions = await GLReconciliationService.getSuggestions(accountCode, req.tenantPool);
  res.json({ success: true, data: suggestions });
}));

/** GET /api/enterprise-accounting/lock-dates */
router.get('/lock-dates', asyncHandler(async (req, res) => {
  const dates = await GLReconciliationService.getLockDates(req.tenantPool);
  res.json({ success: true, data: dates });
}));

/** PUT /api/enterprise-accounting/lock-dates */
router.put('/lock-dates',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const { advisorLockDate, hardLockDate } = req.body;
    await GLReconciliationService.setLockDates(
      { advisorLockDate, hardLockDate },
      req.user!.id,
      req.tenantPool
    );
    res.json({ success: true, message: 'Lock dates updated' });
  })
);

// =============================================================================
// CURRENCY REVALUATION
// =============================================================================

/** GET /api/enterprise-accounting/revaluation/preview?date=2025-12-31 */
router.get('/revaluation/preview', asyncHandler(async (req, res) => {
  const date = req.query.date as string;
  if (!date) {
    return res.status(400).json({ success: false, error: 'date is required (YYYY-MM-DD)' });
  }
  const preview = await CurrencyRevaluationService.preview(date, req.tenantPool);
  res.json({ success: true, data: preview });
}));

/** POST /api/enterprise-accounting/revaluation/execute */
router.post('/revaluation/execute',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const { revaluationDate, autoReverse } = req.body;
    if (!revaluationDate) {
      return res.status(400).json({ success: false, error: 'revaluationDate is required' });
    }
    const result = await CurrencyRevaluationService.revalue(
      {
        revaluationDate,
        userId: req.user!.id,
        autoReverse: autoReverse ?? true,
      },
      req.tenantPool
    );
    res.json({ success: true, data: result });
  })
);

// =============================================================================
// GL INTEGRITY AUDIT
// =============================================================================

/** GET /api/enterprise-accounting/integrity/full-audit */
router.get('/integrity/full-audit',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const report = await GLIntegrityChecker.runFullAudit(req.tenantPool);
    res.json({ success: true, data: report });
  })
);

// =============================================================================
// AGED RECEIVABLES / PAYABLES
// =============================================================================

/** GET /api/enterprise-accounting/aging/receivables?asOfDate=2025-06-15 */
router.get('/aging/receivables', asyncHandler(async (req, res) => {
  const asOfDate = (req.query.asOfDate as string) || getBusinessDate();
  const report = await AgedBalanceService.agedReceivables(asOfDate, req.tenantPool);
  res.json({ success: true, data: report });
}));

/** GET /api/enterprise-accounting/aging/payables?asOfDate=2025-06-15 */
router.get('/aging/payables', asyncHandler(async (req, res) => {
  const asOfDate = (req.query.asOfDate as string) || getBusinessDate();
  const report = await AgedBalanceService.agedPayables(asOfDate, req.tenantPool);
  res.json({ success: true, data: report });
}));

export const enterpriseAccountingRoutes = router;
