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
import { GLReconciliationService } from '../../services/glReconciliationService.js';
import { CurrencyRevaluationService } from '../../services/currencyRevaluationService.js';
import { GLIntegrityChecker } from '../../services/glIntegrityChecker.js';
import { AgedBalanceService } from '../../services/agedBalanceService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// FISCAL YEAR CLOSE
// =============================================================================

/** GET /api/enterprise-accounting/fiscal-year/status?year=2025 */
router.get('/fiscal-year/status', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
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
  const taxes = await TaxEngine.getTaxDefinitions(taxScope, req.tenantPool);
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

  const allTaxes = await TaxEngine.getTaxDefinitions(undefined, req.tenantPool);
  const applicable = allTaxes.filter(t => taxIds.includes(t.id));
  const result = TaxEngine.compute(unitPrice, applicable, quantity);
  res.json({ success: true, data: result });
}));

/** GET /api/enterprise-accounting/taxes/product/:productId — Get taxes for product */
router.get('/taxes/product/:productId', asyncHandler(async (req, res) => {
  const customerId = (req.query.customerId as string) || null;
  const scope = (req.query.scope as string) || 'SALE';
  const validScopes = ['SALE', 'PURCHASE', 'BOTH'];
  const taxScope = validScopes.includes(scope)
    ? (scope as 'SALE' | 'PURCHASE' | 'BOTH')
    : 'SALE' as const;
  const taxes = await TaxEngine.getApplicableTaxes(
    req.params.productId,
    customerId,
    taxScope,
    req.tenantPool
  );
  res.json({ success: true, data: taxes });
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
  const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
  const report = await AgedBalanceService.agedReceivables(asOfDate, req.tenantPool);
  res.json({ success: true, data: report });
}));

/** GET /api/enterprise-accounting/aging/payables?asOfDate=2025-06-15 */
router.get('/aging/payables', asyncHandler(async (req, res) => {
  const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
  const report = await AgedBalanceService.agedPayables(asOfDate, req.tenantPool);
  res.json({ success: true, data: report });
}));

export const enterpriseAccountingRoutes = router;
