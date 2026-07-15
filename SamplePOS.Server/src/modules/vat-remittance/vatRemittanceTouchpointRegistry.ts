/**
 * Canonical ADR-005 touchpoint registry — Gate A (Phase 3A).
 */

export type VatRemittanceTouchpointStatus =
  | 'MIGRATED'
  | 'SHIMMED'
  | 'ALLOW_LISTED'
  | 'DEFERRED'
  | 'CLASSIFIED'
  | 'NOT_STARTED';

export interface VatRemittanceTouchpoint {
  id: string;
  workflow: string;
  entryFile: string;
  targetGateway: string;
  status: VatRemittanceTouchpointStatus;
  owner: string;
  proof: string;
  notes?: string;
}

export const VAT_REMITTANCE_WRITE_GATEWAY =
  'SamplePOS.Server/src/modules/vat-remittance/';

export const VAT_REMITTANCE_TOUCHPOINT_REGISTRY: VatRemittanceTouchpoint[] = [
  {
    id: 'VR01',
    workflow: 'Sale / POS output VAT accrual → 2300',
    entryFile: 'glEntryService.ts',
    targetGateway: 'SALES_INVOICE / CR 2300',
    status: 'CLASSIFIED',
    owner: 'Sales',
    proof: 'Existing accrual; Phase 3 remittance only',
  },
  {
    id: 'VR02',
    workflow: 'Customer CN/DN VAT → 2300',
    entryFile: 'glEntryService.ts',
    targetGateway: 'CN/DN tax lines on 2300',
    status: 'CLASSIFIED',
    owner: 'AR',
    proof: 'PROOF_TAX_COMPLIANCE',
  },
  {
    id: 'VR03',
    workflow: 'Supplier CN/DN VAT → 2300',
    entryFile: 'glEntryService.ts',
    targetGateway: 'SCN/SDN tax lines on 2300',
    status: 'CLASSIFIED',
    owner: 'AP',
    proof: 'PROOF_TAX_COMPLIANCE',
  },
  {
    id: 'VR04',
    workflow: 'Supplier bill / purchase invoice VAT',
    entryFile: 'glEntryService.ts (recordSupplierInvoiceToGL)',
    targetGateway: 'Decision B — inventory-embedded / no 2300 until Option A',
    status: 'CLASSIFIED',
    owner: 'AP',
    proof: 'Phase 3B Decision B; Option A deferred',
    notes: 'Primary structural VR-INV-3 drift source — surfaced by VAT integrity lane',
  },
  {
    id: 'VR05',
    workflow: 'Tax Engine product VAT definitions',
    entryFile: 'taxEngine.ts / tax_definitions',
    targetGateway: 'Accrual calculator only',
    status: 'ALLOW_LISTED',
    owner: 'Tax',
    proof: 'Not a remittance writer',
  },
  {
    id: 'VR06',
    workflow: 'Tax compliance VAT boxes / liability report',
    entryFile: 'whtReportService.ts / taxComplianceReportController.ts',
    targetGateway: 'Report SSOT; settled ← sumPostedVatRemittances (VR-INV-10)',
    status: 'MIGRATED',
    owner: 'Tax',
    proof: 'Phase 3D getTaxLiabilityReport + PROOF_TAX_COMPLIANCE',
  },
  {
    id: 'VR07',
    workflow: 'WHT remit / recover (boundary)',
    entryFile: 'whtService.ts',
    targetGateway: 'WHT_REMITTANCE / 2350|1250 — not VAT',
    status: 'ALLOW_LISTED',
    owner: 'Tax',
    proof: 'VR-INV-9; T12 DEFERRED with waiver T12-W01 (Phase 3D)',
    notes: 'WHT_REMITTANCE TD shim deferred to post-3E / Bad Debt adjacent; expiry 2026-09-30',
  },
  {
    id: 'VR08',
    workflow: 'VAT remittance TD gateway',
    entryFile: 'vatRemittanceService.ts',
    targetGateway: 'VAT_REMITTANCE TD + PostingSource',
    status: 'MIGRATED',
    owner: 'Tax',
    proof: 'Phase 3C createAndPostVatRemittance / reverse',
    notes: 'Flag vat_remittance_document_enabled + treasury_document_enabled',
  },
  {
    id: 'VR09',
    workflow: 'PostingSource VAT_REMITTANCE Rule D',
    entryFile: 'postingGovernanceService.ts',
    targetGateway: 'Allow cash credit for VAT remittance',
    status: 'MIGRATED',
    owner: 'Governance',
    proof: 'Phase 3A',
  },
  {
    id: 'VR10',
    workflow: 'tax_definitions receivable default 1250 collision',
    entryFile: '549_vat_tax_receivable_vr_inv_6.sql',
    targetGateway: 'Default + backfill → 2300 (VR-INV-6)',
    status: 'MIGRATED',
    owner: 'Tax',
    proof: 'Phase 3B schema 549',
  },
  {
    id: 'VR11',
    workflow: 'VAT integrity recon lane',
    entryFile: 'vatAccrualReconService.ts / vatReconciliationProvider.ts',
    targetGateway: 'Document boxes ↔ GL 2300 (informational)',
    status: 'MIGRATED',
    owner: 'Governance',
    proof: 'Phase 3B GET .../reconciliation/vat/integrity',
  },
  {
    id: 'VR12',
    workflow: 'Treasury touchpoint T13 VAT remittance',
    entryFile: 'treasuryTouchpointRegistry.ts',
    targetGateway: 'Points at this registry / 3C gateway',
    status: 'CLASSIFIED',
    owner: 'Treasury',
    proof: 'ADR-003 reserved type; ADR-005 owns implementation',
  },
  {
    id: 'VR13',
    workflow: 'Period-close VAT remittance checklist',
    entryFile: 'financialCloseChecklist.ts',
    targetGateway: 'step-vat-remittance (non-blocking Decision B)',
    status: 'MIGRATED',
    owner: 'Governance',
    proof: 'Phase 3D E-05',
  },
];

export function countVatTouchpointsByStatus(
  status: VatRemittanceTouchpointStatus,
): number {
  return VAT_REMITTANCE_TOUCHPOINT_REGISTRY.filter((t) => t.status === status).length;
}
