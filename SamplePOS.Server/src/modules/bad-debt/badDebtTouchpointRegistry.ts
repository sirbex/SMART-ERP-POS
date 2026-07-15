/**
 * Canonical ADR-006 touchpoint registry — Gate A (Phase 4A).
 */

export type BadDebtTouchpointStatus =
  | 'MIGRATED'
  | 'SHIMMED'
  | 'ALLOW_LISTED'
  | 'DEFERRED'
  | 'CLASSIFIED'
  | 'NOT_STARTED';

export interface BadDebtTouchpoint {
  id: string;
  workflow: string;
  entryFile: string;
  targetGateway: string;
  status: BadDebtTouchpointStatus;
  owner: string;
  proof: string;
  notes?: string;
}

export const BAD_DEBT_WRITE_GATEWAY = 'SamplePOS.Server/src/modules/bad-debt/';

export const BAD_DEBT_TOUCHPOINT_REGISTRY: BadDebtTouchpoint[] = [
  {
    id: 'BD01',
    workflow: 'Customer invoice creates AR (1200)',
    entryFile: 'glEntryService.ts',
    targetGateway: 'SALES_INVOICE → DR 1200',
    status: 'ALLOW_LISTED',
    owner: 'AR',
    proof: 'Accrual path — not a write-off',
  },
  {
    id: 'BD02',
    workflow: 'Customer payment clears AR',
    entryFile: 'arPaymentService.ts / glEntryService.ts',
    targetGateway: 'PAYMENT_RECEIPT → CR 1200',
    status: 'ALLOW_LISTED',
    owner: 'AR',
    proof: 'Cash collection — not uncollectible',
  },
  {
    id: 'BD03',
    workflow: 'Customer credit note clears AR',
    entryFile: 'creditDebitNoteService.ts',
    targetGateway: 'SALES_REFUND → DR 4010 / CR 1200',
    status: 'ALLOW_LISTED',
    owner: 'AR',
    proof: 'BD-INV-4 commercial only; not bad debt',
    notes: 'Fitness rejects CN reason codes mapping to uncollectible write-off',
  },
  {
    id: 'BD04',
    workflow: 'Customer deposit application clears AR',
    entryFile: 'depositsService.ts',
    targetGateway: 'Apply 2200 → CR 1200',
    status: 'ALLOW_LISTED',
    owner: 'AR',
    proof: 'Cash already collected',
  },
  {
    id: 'BD05',
    workflow: 'Sale void / force void reverses AR',
    entryFile: 'sales modules',
    targetGateway: 'Reversal journals — not expense write-off',
    status: 'ALLOW_LISTED',
    owner: 'Sales',
    proof: 'Operational cancel — distinct from uncollectible',
  },
  {
    id: 'BD06',
    workflow: 'adjustCustomerBalance / balance-only adjust',
    entryFile: 'customer modules',
    targetGateway: 'Subledger only — MUST NOT be write-off path',
    status: 'CLASSIFIED',
    owner: 'AR',
    proof: 'BD-INV-3/6 — Gate A tracks; no AR_WRITEOFF invention',
    notes: 'Dangerous without GL; Phase 4B must not call this as settlement',
  },
  {
    id: 'BD07',
    workflow: 'GL recon writeOffAmount tip',
    entryFile: 'glReconciliationService.ts',
    targetGateway: 'SYSTEM_CORRECTION residual tip',
    status: 'ALLOW_LISTED',
    owner: 'Governance',
    proof: 'Matching residual — not customer uncollectible (ADR § context)',
  },
  {
    id: 'BD08',
    workflow: 'Inventory loss disposal',
    entryFile: 'modules/loss-quarantine/',
    targetGateway: 'LOSS_DISPOSAL → 5110/5120/5130 / 1300',
    status: 'ALLOW_LISTED',
    owner: 'Inventory',
    proof: 'BD-INV-5 boundary — never clears 1200',
  },
  {
    id: 'BD09',
    workflow: 'Manual journal credit to AR',
    entryFile: 'postingGovernanceService.ts',
    targetGateway: 'Blocked by Rule A/C on 1200',
    status: 'ALLOW_LISTED',
    owner: 'Governance',
    proof: 'BD-INV-6 — MANUAL_JOURNAL must not write off AR',
  },
  {
    id: 'BD10',
    workflow: 'AR write-off document gateway',
    entryFile: 'badDebtService.ts',
    targetGateway: 'createAndPostWriteoff / reverseWriteoff (AR_WRITEOFF)',
    status: 'MIGRATED',
    owner: 'AR',
    proof: 'Phase 4B badDebtPostingProof + createAndPostWriteoff',
    notes: 'Flag bad_debt_writeoff_enabled; schema 551 documents',
  },
  {
    id: 'BD11',
    workflow: 'PostingSource AR_WRITEOFF allow-list',
    entryFile: 'postingGovernanceService.ts + migration 550',
    targetGateway: '1200 + 5210 AllowedSources',
    status: 'MIGRATED',
    owner: 'Governance',
    proof: 'Phase 4A',
  },
  {
    id: 'BD12',
    workflow: 'CoA Bad Debt Expense 5210',
    entryFile: '550_bad_debt_foundation.sql',
    targetGateway: 'AccountCodes.BAD_DEBT_EXPENSE',
    status: 'MIGRATED',
    owner: 'Tax/AR',
    proof: 'Phase 4A schema 550',
  },
  {
    id: 'BD13',
    workflow: 'Ops UI workqueue + post/reverse',
    entryFile: 'BadDebtWriteoffPage.tsx + badDebtRoutes workqueue/documents',
    targetGateway: 'UI → /api/bad-debt/* → badDebtService',
    status: 'MIGRATED',
    owner: 'AR',
    proof: 'Phase 4C BadDebtWriteoffPage; CN vs write-off guardrail copy',
    notes: 'accounting.manage for mutations; accounting.read for queue/docs',
  },
  {
    id: 'BD14',
    workflow: 'CN reason codes reject uncollectible intent',
    entryFile: 'creditDebitNoteService.ts + badDebtInvariants',
    targetGateway: 'assertCreditNoteReasonNotBadDebt (BD-INV-4)',
    status: 'MIGRATED',
    owner: 'AR',
    proof: 'Phase 4D fitness + architecture proof',
  },
  {
    id: 'BD15',
    workflow: 'Orphan CR 1200 + expense scan / heal policy',
    entryFile: 'badDebtOrphanScan.ts + glRepairService recalcCustomerBalances',
    targetGateway: 'scanOrphanArExpenseWriteoffs; heal never invents AR_WRITEOFF',
    status: 'MIGRATED',
    owner: 'Governance',
    proof: 'Phase 4D BD-INV-6 fitness + governance proof',
  },
  {
    id: 'BD16',
    workflow: 'Write-off exposure lane + period-close checklist',
    entryFile: 'arReconciliationLanes + financialCloseChecklist',
    targetGateway: 'AR writeoff lane + step-bad-debt-writeoff (non-blocking)',
    status: 'MIGRATED',
    owner: 'AR',
    proof: 'Phase 4D E-05',
  },
];

export function countBadDebtTouchpointsByStatus(status: BadDebtTouchpointStatus): number {
  return BAD_DEBT_TOUCHPOINT_REGISTRY.filter((t) => t.status === status).length;
}
