/**
 * Canonical ADR-007 report SSOT registry — Gate A (Phase 5A).
 */

export type ReportingTouchpointStatus =
  | 'MIGRATED'
  | 'CANONICAL'
  | 'OPERATIONAL'
  | 'LEGACY'
  | 'ALLOW_LISTED'
  | 'DEFERRED'
  | 'NOT_STARTED';

export type ReportingSurfaceClass =
  | 'FINANCIAL'
  | 'TAX'
  | 'CLOSE'
  | 'OPERATIONAL'
  | 'LEGACY';

export interface ReportingTouchpoint {
  id: string;
  surface: string;
  entryFile: string;
  calculationOwner: string;
  class: ReportingSurfaceClass;
  status: ReportingTouchpointStatus;
  owner: string;
  proof: string;
  notes?: string;
}

export const REPORTING_WRITE_GATEWAY = 'declared SSOT per ADR-007 registry';

export const REPORTING_TOUCHPOINT_REGISTRY: ReportingTouchpoint[] = [
  {
    id: 'RP01',
    surface: 'ERP financial P&L (GL)',
    entryFile: 'erpAccountingRoutes.ts → fn_get_profit_loss*',
    calculationOwner: 'fn_get_profit_loss / _summary (migration 539)',
    class: 'FINANCIAL',
    status: 'CANONICAL',
    owner: 'Accounting',
    proof: 'PROOF_PNL_SSOT.md',
  },
  {
    id: 'RP02',
    surface: 'GL P&L UI',
    entryFile: 'ProfitLossPage.tsx',
    calculationOwner: 'ERP /erp-accounting/reports/profit-loss',
    class: 'FINANCIAL',
    status: 'CANONICAL',
    owner: 'Accounting',
    proof: 'PROOF_PNL_SSOT.md',
  },
  {
    id: 'RP03',
    surface: 'P&L verify / comparative',
    entryFile: 'erpAccountingRoutes.ts + profitLossReportService verify helpers',
    calculationOwner: 'fn_get_profit_loss* rollup',
    class: 'FINANCIAL',
    status: 'CANONICAL',
    owner: 'Accounting',
    proof: 'PROOF_PNL_SSOT.md',
  },
  {
    id: 'RP04',
    surface: 'Service P&L (documents / comparative helpers)',
    entryFile: 'profitLossReportService.getProfitLossReport',
    calculationOwner: 'fn_get_profit_loss / _summary (migration 539)',
    class: 'FINANCIAL',
    status: 'MIGRATED',
    owner: 'Accounting',
    proof: 'Phase 5B — removed gl_period_balances dual path',
    notes: 'Same SSOT as RP01 ERP route; used by documentRenderer P&L PDF',
  },
  {
    id: 'RP05',
    surface: 'Ops sales-derived P&L',
    entryFile: 'reportsService.generateProfitLoss',
    calculationOwner: 'sales / reportsRepository (operational)',
    class: 'OPERATIONAL',
    status: 'OPERATIONAL',
    owner: 'Sales/Ops',
    proof: 'RP-INV-3 — not financial close SSOT',
  },
  {
    id: 'RP06',
    surface: 'Tax compliance package',
    entryFile: 'taxComplianceReportController → whtReportService',
    calculationOwner: 'whtReportService',
    class: 'TAX',
    status: 'CANONICAL',
    owner: 'Tax',
    proof: 'PROOF_TAX_COMPLIANCE.md',
  },
  {
    id: 'RP07',
    surface: 'Financial close checklist',
    entryFile: 'financialCloseChecklist.ts',
    calculationOwner: 'lane summaries + E-05 domain steps',
    class: 'CLOSE',
    status: 'CANONICAL',
    owner: 'Governance',
    proof: 'Phases 2–4 E-05 + RP-INV-6',
  },
  {
    id: 'RP08',
    surface: 'Financial health / integrity lanes',
    entryFile: 'financialLaneService + providers',
    calculationOwner: 'domain lane providers',
    class: 'CLOSE',
    status: 'CANONICAL',
    owner: 'Governance',
    proof: 'financial reconciliation framework',
  },
  {
    id: 'RP09',
    surface: 'Close ReportsLauncher',
    entryFile: 'ReportsLauncher.tsx',
    calculationOwner: 'static links → FINANCIAL/TAX/CLOSE surfaces',
    class: 'CLOSE',
    status: 'MIGRATED',
    owner: 'Accounting UX',
    proof: 'Phase 5C — GL P&L, tax, VAT, quarantine, bad debt + operational labels',
  },
  {
    id: 'RP10',
    surface: 'Warehouse network reports',
    entryFile: 'warehouseReportingService.ts',
    calculationOwner: 'inventory warehouse subledger',
    class: 'OPERATIONAL',
    status: 'OPERATIONAL',
    owner: 'Inventory',
    proof: 'ADR-007 non-goal for redesign',
  },
  {
    id: 'RP11',
    surface: 'Quarantine aging close hook',
    entryFile: 'step-quarantine-aging',
    calculationOwner: 'inventory quarantine lane',
    class: 'CLOSE',
    status: 'CANONICAL',
    owner: 'Inventory',
    proof: 'ADR-004 E-05',
  },
  {
    id: 'RP12',
    surface: 'VAT remittance close hook',
    entryFile: 'step-vat-remittance',
    calculationOwner: 'vat remittance / tax payable review',
    class: 'CLOSE',
    status: 'CANONICAL',
    owner: 'Tax',
    proof: 'ADR-005 E-05',
  },
  {
    id: 'RP13',
    surface: 'Bad debt write-off close hook',
    entryFile: 'step-bad-debt-writeoff',
    calculationOwner: 'AR writeoff exposure / workqueue',
    class: 'CLOSE',
    status: 'CANONICAL',
    owner: 'AR',
    proof: 'ADR-006 E-05',
  },
  {
    id: 'RP14',
    surface: 'Cross-domain P&L honesty (loss / quarantine / bad debt / tax)',
    entryFile: 'reportingCrossDomainHonestyProof.test.ts',
    calculationOwner: '539 classification + domain gateways',
    class: 'FINANCIAL',
    status: 'MIGRATED',
    owner: 'Governance',
    proof: 'Phase 5D RP-INV-5/7/8/9',
  },
];

export function countReportingTouchpointsByStatus(status: ReportingTouchpointStatus): number {
  return REPORTING_TOUCHPOINT_REGISTRY.filter((t) => t.status === status).length;
}

export function countReportingTouchpointsByClass(surfaceClass: ReportingSurfaceClass): number {
  return REPORTING_TOUCHPOINT_REGISTRY.filter((t) => t.class === surfaceClass).length;
}
