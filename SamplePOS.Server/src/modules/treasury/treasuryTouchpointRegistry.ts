/**
 * Canonical ADR-003 touchpoint registry — Gate A certification.
 * Update status when migrating paths; do not delete rows (audit trail).
 */

export type TreasuryTouchpointStatus =
  | 'MIGRATED'
  | 'SHIMMED'
  | 'ALLOW_LISTED'
  | 'DEFERRED'
  | 'NOT_STARTED';

export interface TreasuryTouchpoint {
  id: string;
  workflow: string;
  entryFile: string;
  targetGateway: string;
  status: TreasuryTouchpointStatus;
  owner: string;
  proof: string;
  notes?: string;
}

/** Sole write gateway for liquidity *movements* (settlement / transfer / petty / remittance). */
export const TREASURY_WRITE_GATEWAY = 'SamplePOS.Server/src/modules/treasury/';

/** Receipts remain PAYMENT_RECEIPT into clearing — not Treasury Documents (ADR § boundary). */
export const RECEIPT_CLEARING_GATEWAY = 'PAYMENT_RECEIPT → Undeposited Funds (1015)';

export const TREASURY_CERTIFICATION_EXIT = {
  touchpointsNotStarted: 0,
  proofGatesPass: ['A', 'B', 'C', 'D', 'E'] as const,
} as const;

/**
 * Every liquidity writer must appear here.
 * Status meanings (charter Gate A):
 *   MIGRATED    — posts via TreasuryService / TD creators when flag on
 *   SHIMMED     — legacy source still exists but TD dual-write or TD path preferred when flag on
 *   ALLOW_LISTED — intentionally not TD (e.g. receipts into clearing, AP cash out)
 *   DEFERRED    — Phase 2+ (VAT remittance, etc.)
 */
export const TREASURY_TOUCHPOINT_REGISTRY: TreasuryTouchpoint[] = [
  {
    id: 'T01',
    workflow: 'AR / POS payment receipt into clearing',
    entryFile: 'glEntryService.ts / arPaymentService.ts',
    targetGateway: RECEIPT_CLEARING_GATEWAY,
    status: 'ALLOW_LISTED',
    owner: 'AR',
    proof: 'ADR § boundary — receipts are not TD',
    notes: 'PAYMENT_RECEIPT → 1015; settlement is Deposit Worksheet (T03)',
  },
  {
    id: 'T02',
    workflow: 'Customer deposit cash into clearing',
    entryFile: 'depositsService.ts',
    targetGateway: RECEIPT_CLEARING_GATEWAY,
    status: 'ALLOW_LISTED',
    owner: 'AR',
    proof: 'receipt_settlements backfill (542)',
  },
  {
    id: 'T03',
    workflow: 'Deposit Worksheet (clear 1015 → bank/cash)',
    entryFile: 'depositWorksheetService.ts',
    targetGateway: 'createDepositWorksheet → TreasuryService.post',
    status: 'MIGRATED',
    owner: 'Treasury',
    proof: 'depositWorksheet.test.ts + Phase 1B',
  },
  {
    id: 'T04',
    workflow: 'Legacy banking PAYMENT_DEPOSIT',
    entryFile: 'bankingService.ts',
    targetGateway: 'Deposit Worksheet (preferred) / PAYMENT_DEPOSIT legacy',
    status: 'ALLOW_LISTED',
    owner: 'Banking',
    proof: 'Rule E + charter A-06 — superseded by T03 when flag on',
    notes: 'Flag-off / legacy deposit UI may still use PAYMENT_DEPOSIT; new UI is TD',
  },
  {
    id: 'T05',
    workflow: 'Register CASH_OUT_BANK',
    entryFile: 'cashRegisterService.ts',
    targetGateway: 'createTreasuryTransfer (flag on)',
    status: 'SHIMMED',
    owner: 'POS',
    proof: 'cashRegisterService treasuryOn branch',
  },
  {
    id: 'T06',
    workflow: 'Register CASH_IN_FLOAT',
    entryFile: 'cashRegisterService.ts',
    targetGateway: 'createTreasuryTransfer (flag on)',
    status: 'SHIMMED',
    owner: 'POS',
    proof: 'cashRegisterService treasuryOn branch',
  },
  {
    id: 'T07',
    workflow: 'Register CASH_OUT_EXPENSE (petty)',
    entryFile: 'cashRegisterService.ts',
    targetGateway: 'createPettyCashDocument (flag on)',
    status: 'SHIMMED',
    owner: 'POS',
    proof: 'pettyCash.test.ts + Phase 1D',
  },
  {
    id: 'T08',
    workflow: 'Banking inter-account transfer',
    entryFile: 'bankingService.ts',
    targetGateway: 'createAndPostTransferInTx (flag on)',
    status: 'SHIMMED',
    owner: 'Banking',
    proof: 'treasuryTransfer.test.ts',
  },
  {
    id: 'T09',
    workflow: 'Treasury Transfer UI',
    entryFile: 'treasuryTransferService.ts',
    targetGateway: 'TreasuryService.post TREASURY_TRANSFER',
    status: 'MIGRATED',
    owner: 'Treasury',
    proof: 'Phase 1C',
  },
  {
    id: 'T10',
    workflow: 'Petty cash fund / replenish / expense UI',
    entryFile: 'pettyCashService.ts',
    targetGateway: 'TreasuryService.post TREASURY_PETTY_CASH',
    status: 'MIGRATED',
    owner: 'Treasury',
    proof: 'Phase 1D',
  },
  {
    id: 'T11',
    workflow: 'Supplier / AP cash payment',
    entryFile: 'supplierPaymentService.ts',
    targetGateway: 'SUPPLIER_PAYMENT (Rule D allow-list)',
    status: 'ALLOW_LISTED',
    owner: 'AP',
    proof: 'ADR — AP reduction is not a treasury movement document',
  },
  {
    id: 'T12',
    workflow: 'WHT remittance to authority',
    entryFile: 'whtService.ts',
    targetGateway: 'WHT_REMITTANCE → future TD type',
    status: 'DEFERRED',
    owner: 'Tax',
    proof: 'Waiver T12-W01 (Phase 3D); expires 2026-09-30',
    notes:
      'Governed WHT_REMITTANCE source remains; TD shim deferred post-3E. VAT stays on separate VAT_REMITTANCE path (VR-INV-9).',
  },
  {
    id: 'T13',
    workflow: 'VAT remittance',
    entryFile: 'modules/vat-remittance/vatRemittanceService.ts',
    targetGateway: 'VAT_REMITTANCE TD + PostingSource',
    status: 'MIGRATED',
    owner: 'Tax',
    proof: 'ADR-005 Phase 3C',
    notes: 'createAndPostVatRemittance; flags treasury + vat_remittance',
  },
  {
    id: 'T14',
    workflow: 'Manual journal to liquidity accounts',
    entryFile: 'journalEntryService.ts / accountingCore.ts',
    targetGateway: 'Blocked by Rule C/D (except CASH debit equity inject)',
    status: 'ALLOW_LISTED',
    owner: 'Governance',
    proof: 'postingGovernanceService Rule C/D',
    notes: 'A-04: no new MANUAL_JOURNAL path may post liquidity credits',
  },
  {
    id: 'T15',
    workflow: 'Sale refund cash out',
    entryFile: 'glEntryService.ts',
    targetGateway: 'SALES_REFUND (Rule D allow-list)',
    status: 'ALLOW_LISTED',
    owner: 'Sales',
    proof: 'Rule D',
  },
  {
    id: 'T16',
    workflow: 'Treasury Document reverse',
    entryFile: 'treasuryService.ts',
    targetGateway: 'TREASURY_REVERSAL',
    status: 'MIGRATED',
    owner: 'Treasury',
    proof: 'treasuryInvariants.test.ts TD-INV-3',
  },
];

export function countTouchpointsByStatus(status: TreasuryTouchpointStatus): number {
  return TREASURY_TOUCHPOINT_REGISTRY.filter((t) => t.status === status).length;
}
