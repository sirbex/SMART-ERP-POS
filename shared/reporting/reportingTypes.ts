/**
 * Cross-domain reporting classifiers (ADR-007 Phase 5A)
 */

export const REPORT_SURFACE_CLASSES = [
  'FINANCIAL',
  'TAX',
  'CLOSE',
  'OPERATIONAL',
  'LEGACY',
] as const;

export type ReportSurfaceClass = (typeof REPORT_SURFACE_CLASSES)[number];

/** Financial P&L ledger functions (migration 539+). */
export const FINANCIAL_PNL_FUNCTIONS = [
  'fn_get_profit_loss',
  'fn_get_profit_loss_summary',
  'fn_get_profit_loss_by_customer',
  'fn_get_profit_loss_by_product',
  'fn_get_profit_loss_by_category',
] as const;

export const FINANCIAL_PNL_ERP_ROUTE = '/api/erp-accounting/reports/profit-loss';
export const FINANCIAL_PNL_UI_PATH = '/accounting/profit-loss';
export const TAX_COMPLIANCE_UI_PATH = '/reports/tax-compliance';
