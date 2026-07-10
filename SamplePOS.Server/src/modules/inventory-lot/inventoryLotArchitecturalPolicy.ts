/**
 * Inventory Lot architectural policy (Gate J).
 * PENDING_ARCHITECTURAL_DEBT must be empty at certification.
 * Auxiliary paths are approved infrastructure — not lot-domain bypasses.
 */

export interface ArchitecturalAuxiliaryPath {
  file: string;
  scope: string;
  allowedOperations: Array<'status_reconcile' | 'coupling_repair' | 'read_only' | 'draft_line'>;
}

/**
 * Approved auxiliary modules — narrowly scoped, ADR-documented.
 * Not counted as debt; fitness verifies scope per file.
 */
export const ARCHITECTURAL_AUXILIARY_ALLOWLIST: ArchitecturalAuxiliaryPath[] = [
  {
    file: 'SamplePOS.Server/src/utils/inventorySync.ts',
    scope: 'Post-mutation status reconcile on remaining_quantity (no qty/expiry attribute writes)',
    allowedOperations: ['status_reconcile'],
  },
  {
    file: 'SamplePOS.Server/src/services/warehouseInventoryCoupling.ts',
    scope: 'Multistore subledger repair — align batch remaining to store balances after LotService TX',
    allowedOperations: ['coupling_repair'],
  },
  {
    file: 'SamplePOS.Server/src/modules/goods-receipts/goodsReceiptRepository.ts',
    scope: 'GR draft line expiry on goods_receipt_items — not lot master',
    allowedOperations: ['draft_line'],
  },
];

/** Certification requires zero entries. */
export const PENDING_ARCHITECTURAL_DEBT: Array<{
  file: string;
  reason: string;
  targetMigration: string;
  touchpointId?: string;
}> = [];

/** @deprecated Use PENDING_ARCHITECTURAL_DEBT */
export const DOCUMENTED_LEGACY_WRITE_EXCEPTIONS = PENDING_ARCHITECTURAL_DEBT;

export function isAuxiliaryPath(filePath: string): ArchitecturalAuxiliaryPath | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  return ARCHITECTURAL_AUXILIARY_ALLOWLIST.find((e) => normalized.endsWith(e.file.replace(/^SamplePOS\.Server\//, ''))
    || normalized === e.file);
}
