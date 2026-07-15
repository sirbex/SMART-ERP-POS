/**
 * Phase F0 — catalog of legacy reconciliation surfaces scheduled for retirement.
 * Used for deprecation headers, consumer logging, and parity audits.
 */

export type LegacySurfaceKind = 'endpoint' | 'sql_function' | 'service' | 'report' | 'ui';

export interface LegacyReconciliationSurface {
  id: string;
  kind: LegacySurfaceKind;
  pathOrSymbol: string;
  description: string;
  /** Authoritative replacement (API path, service, or doc anchor). */
  successor: string;
  /** Whether the legacy surface still uses old SQL semantics vs new SSOT. */
  implementation: 'legacy-sql' | 'legacy-shape-ssot' | 'legacy-semantics';
  sunsetPhase: 'F';
}

/** Stabilization window — legacy remains callable through this phase. */
export const LEGACY_RECONCILIATION_SUNSET_HEADER = 'Sat, 01 Mar 2027 00:00:00 GMT';

export const LEGACY_RECONCILIATION_SURFACES: LegacyReconciliationSurface[] = [
  {
    id: 'erp.reconciliation.summary',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/erp-accounting/reconciliation/summary',
    description: 'Full account summary (formerly fn_full_reconciliation_report only)',
    successor: 'GET /api/erp-accounting/reconciliation/financial-health',
    implementation: 'legacy-shape-ssot',
    sunsetPhase: 'F',
  },
  {
    id: 'erp.reconciliation.accounts-payable',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/erp-accounting/reconciliation/accounts-payable',
    description: 'Detailed AP reconciliation report (legacy response shape)',
    successor: 'GET /api/erp-accounting/reconciliation/ap/{integrity,cache,history}',
    implementation: 'legacy-shape-ssot',
    sunsetPhase: 'F',
  },
  {
    id: 'erp.reconciliation.accounts-receivable',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/erp-accounting/reconciliation/accounts-receivable',
    description: 'Detailed AR reconciliation report (legacy response shape)',
    successor: 'GET /api/erp-accounting/reconciliation/ar/{integrity,cache,history}',
    implementation: 'legacy-shape-ssot',
    sunsetPhase: 'F',
  },
  {
    id: 'erp.reconciliation.inventory',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/erp-accounting/reconciliation/inventory',
    description: 'Detailed inventory reconciliation report (legacy response shape)',
    successor: 'GET /api/erp-accounting/reconciliation/inventory/{integrity,cache,history,quarantine}',
    implementation: 'legacy-shape-ssot',
    sunsetPhase: 'F',
  },
  {
    id: 'erp.reconciliation.cash',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/erp-accounting/reconciliation/cash',
    description: 'Cash account reconciliation',
    successor: 'GET /api/erp-accounting/reconciliation/lanes/cash/integrity (planned)',
    implementation: 'legacy-sql',
    sunsetPhase: 'F',
  },
  {
    id: 'erp.reconciliation.discrepancies',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/erp-accounting/reconciliation/:accountCode/discrepancies',
    description: 'Per-entity discrepancy drilldown (pre-lane SQL semantics)',
    successor: 'Lane exception tables on /reconciliation/{domain}/{integrity|cache}',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'accounting.integrity.full',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/accounting/integrity',
    description: 'Legacy gross-GL vs subledger integrity bundle',
    successor: 'GET /api/erp-accounting/reconciliation/financial-health',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'accounting.integrity.ar',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/accounting/integrity/ar',
    description: 'Legacy AR integrity (gross GL vs customers.balance)',
    successor: 'GET /api/erp-accounting/reconciliation/ar/integrity',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'accounting.integrity.ap',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/accounting/integrity/ap',
    description: 'Legacy AP integrity check',
    successor: 'GET /api/erp-accounting/reconciliation/ap/integrity',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'accounting.integrity.inventory',
    kind: 'endpoint',
    pathOrSymbol: 'GET /api/accounting/integrity/inventory',
    description: 'Legacy inventory integrity check',
    successor: 'GET /api/erp-accounting/reconciliation/inventory/integrity',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'sql.fn_full_reconciliation_report',
    kind: 'sql_function',
    pathOrSymbol: 'fn_full_reconciliation_report(DATE)',
    description: 'SQL summary report for all control accounts',
    successor: 'financialLaneService.getAllDomainSummaries',
    implementation: 'legacy-sql',
    sunsetPhase: 'F',
  },
  {
    id: 'sql.fn_reconcile_cash_account',
    kind: 'sql_function',
    pathOrSymbol: 'fn_reconcile_cash_account(DATE)',
    description: 'Cash reconciliation SQL',
    successor: 'Cash FinancialLaneProvider (planned)',
    implementation: 'legacy-sql',
    sunsetPhase: 'F',
  },
  {
    id: 'sql.fn_reconcile_accounts_receivable',
    kind: 'sql_function',
    pathOrSymbol: 'fn_reconcile_accounts_receivable(DATE)',
    description: 'Dropped / unused AR reconcile SQL',
    successor: 'arReconciliationMetrics.captureArReconciliationMetrics',
    implementation: 'legacy-sql',
    sunsetPhase: 'F',
  },
  {
    id: 'sql.fn_reconcile_accounts_payable',
    kind: 'sql_function',
    pathOrSymbol: 'fn_reconcile_accounts_payable(DATE)',
    description: 'Legacy AP reconcile SQL',
    successor: 'apReconciliationMetrics.captureApReconciliationMetrics',
    implementation: 'legacy-sql',
    sunsetPhase: 'F',
  },
  {
    id: 'sql.fn_reconcile_inventory',
    kind: 'sql_function',
    pathOrSymbol: 'fn_reconcile_inventory(DATE)',
    description: 'Legacy inventory reconcile SQL (non-net-active GL)',
    successor: 'inventoryReconciliationMetrics.captureInventoryReconciliationMetrics',
    implementation: 'legacy-sql',
    sunsetPhase: 'F',
  },
  {
    id: 'service.glValidationService.checkAR',
    kind: 'service',
    pathOrSymbol: 'glValidationService.checkARReconciliation',
    description: 'Legacy AR GL validation',
    successor: 'arReconciliationLanes.getArIntegrityLane',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'service.glValidationService.checkAP',
    kind: 'service',
    pathOrSymbol: 'glValidationService.checkAPReconciliation',
    description: 'Legacy AP GL validation',
    successor: 'apReconciliationLanes.getApIntegrityLane',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'service.glValidationService.checkInventory',
    kind: 'service',
    pathOrSymbol: 'glValidationService.checkInventoryReconciliation',
    description: 'Legacy inventory GL validation',
    successor: 'inventoryReconciliationLanes.getInventoryIntegrityLane',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'report.inventory.reconciliation',
    kind: 'report',
    pathOrSymbol: 'GET /api/reports/inventory/reconciliation',
    description: 'Inventory report using cost_layers subledger',
    successor: 'GET /api/erp-accounting/reconciliation/inventory/integrity',
    implementation: 'legacy-semantics',
    sunsetPhase: 'F',
  },
  {
    id: 'ui.reconciliation.summary',
    kind: 'ui',
    pathOrSymbol: 'ReconciliationPage → fetchReconciliationSummary',
    description: 'Legacy summary table (still calls /reconciliation/summary)',
    successor: 'FinancialHealthDashboard + lane panels',
    implementation: 'legacy-shape-ssot',
    sunsetPhase: 'F',
  },
  {
    id: 'ui.reconciliation.account-detail',
    kind: 'ui',
    pathOrSymbol: 'ReconciliationPage → fetchAccountReconciliation',
    description: 'Legacy per-account detail modal',
    successor: 'FinancialLaneCard expanded exceptions',
    implementation: 'legacy-shape-ssot',
    sunsetPhase: 'F',
  },
];

export function getLegacySurface(id: string): LegacyReconciliationSurface | undefined {
  return LEGACY_RECONCILIATION_SURFACES.find((s) => s.id === id);
}
