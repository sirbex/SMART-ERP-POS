/**
 * Canonical ADR-004 touchpoint registry — Gate A (Phase 2A).
 */

export type LossQuarantineTouchpointStatus =
  | 'MIGRATED'
  | 'SHIMMED'
  | 'ALLOW_LISTED'
  | 'DEFERRED'
  | 'CLASSIFIED'
  | 'NOT_STARTED';

export interface LossQuarantineTouchpoint {
  id: string;
  workflow: string;
  entryFile: string;
  targetGateway: string;
  status: LossQuarantineTouchpointStatus;
  owner: string;
  proof: string;
  notes?: string;
}

export const LOSS_QUARANTINE_WRITE_GATEWAY =
  'SamplePOS.Server/src/modules/loss-quarantine/';

export const LOSS_QUARANTINE_TOUCHPOINT_REGISTRY: LossQuarantineTouchpoint[] = [
  {
    id: 'LQ01',
    workflow: 'Multistore DAMAGE OUT quarantine',
    entryFile: 'warehouseAdjustmentService.ts',
    targetGateway: 'QUARANTINE_TRANSFER (posts_gl=false)',
    status: 'CLASSIFIED',
    owner: 'Inventory',
    proof: 'Phase 2A economic_event tag',
    notes: 'No GL; batch remaining unchanged',
  },
  {
    id: 'LQ02',
    workflow: 'Expiry automation → EXPIRED store',
    entryFile: 'expiryAutomationService.ts',
    targetGateway: 'QUARANTINE_TRANSFER (posts_gl=false)',
    status: 'CLASSIFIED',
    owner: 'Inventory',
    proof: 'EXPIRY_AUTOMATION backfill + tag',
  },
  {
    id: 'LQ03',
    workflow: 'Single-store / handler DAMAGE write-off',
    entryFile: 'stockMovementHandler.ts',
    targetGateway: 'LOSS_DISPOSAL via recordStockMovementToGL',
    status: 'SHIMMED',
    owner: 'Inventory',
    proof: 'Existing INVENTORY_MOVE; disposal document in 2C',
  },
  {
    id: 'LQ04',
    workflow: 'UI EXPIRY reason (valued write-off)',
    entryFile: 'warehouseAdjustmentService.ts / stockMovementHandler.ts',
    targetGateway: 'LOSS_DISPOSAL',
    status: 'SHIMMED',
    owner: 'Inventory',
    proof: 'Handler GL 5130',
  },
  {
    id: 'LQ05',
    workflow: 'WRITE_OFF / ADJUSTMENT_OUT',
    entryFile: 'warehouseAdjustmentService.ts',
    targetGateway: 'LOSS_DISPOSAL (5110 today; reason map in 2C)',
    status: 'SHIMMED',
    owner: 'Inventory',
    proof: 'ADJUSTMENT_OUT → 5110',
  },
  {
    id: 'LQ06',
    workflow: 'PHYSICAL_COUNT short',
    entryFile: 'stockCountService.ts / warehouseAdjustmentService.ts',
    targetGateway: 'LOSS_DISPOSAL',
    status: 'SHIMMED',
    owner: 'Inventory',
    proof: 'ADJUSTMENT_OUT path',
  },
  {
    id: 'LQ07',
    workflow: 'ADJUSTMENT_IN overage',
    entryFile: 'stockMovementHandler.ts',
    targetGateway: 'CR 4110 / DR 1300',
    status: 'ALLOW_LISTED',
    owner: 'Inventory',
    proof: 'Overage is not a loss document',
  },
  {
    id: 'LQ08',
    workflow: 'Legacy recordStockAdjustmentToGL (6900)',
    entryFile: 'glEntryService.ts',
    targetGateway: 'Guarded — ALLOW_LEGACY_STOCK_ADJUSTMENT_GL=1 only',
    status: 'MIGRATED',
    owner: 'Governance',
    proof: 'ADR-004 Phase 2D throws unless emergency env',
  },
  {
    id: 'LQ09',
    workflow: 'glRepair missing STOCK_MOVEMENT GL',
    entryFile: 'glRepairService.ts',
    targetGateway: 'Skip posts_gl=false / QUARANTINE_TRANSFER (LQ-INV-8)',
    status: 'MIGRATED',
    owner: 'Governance',
    proof: 'Phase 2D repair SQL + shouldSkipGlRepairForMovement',
  },
  {
    id: 'LQ10',
    workflow: 'Inventory GL drift heal (5110/4110)',
    entryFile: 'fixInventoryGLDrift.ts',
    targetGateway: 'SYSTEM_CORRECTION + quarantine exposure notes',
    status: 'CLASSIFIED',
    owner: 'Governance',
    proof: 'Phase 2D — quarantine value on 1300 is not shrinkage heal',
  },
  {
    id: 'LQ11',
    workflow: 'Loss disposal document gateway',
    entryFile: 'lossDisposalService.ts',
    targetGateway: 'disposeFromQuarantine / reverseDisposal',
    status: 'MIGRATED',
    owner: 'Inventory',
    proof: 'Phase 2C',
  },
  {
    id: 'LQ12',
    workflow: 'Lot status QUARANTINED on DAMAGE path',
    entryFile: 'warehouseAdjustmentService.ts / quarantineLotStatus.ts',
    targetGateway: 'syncLotStatusAfterQuarantine',
    status: 'MIGRATED',
    owner: 'Inventory',
    proof: 'Phase 2B — QUARANTINED when sellable qty = 0',
  },
  {
    id: 'LQ13',
    workflow: 'Single-store soft quarantine (status + workqueue + dispose parity)',
    entryFile: 'softQuarantineService.ts / quarantineAgingService.ts / lossDisposalService.ts',
    targetGateway: 'QUARANTINE_TRANSFER then LOSS_DISPOSAL (same gateway)',
    status: 'CLASSIFIED',
    owner: 'Inventory',
    proof: 'PROOF_SOFT_QUARANTINE_P1–P4 + LQ-INV-1/6/9',
    notes:
      'P1 soft apply/aging/dispose; P2 unified expiry automation (flag default off); P3 Expiring Items bridge; P4 auto-dispose after aging (separate flag, EXPIRED only, default off). See LOSS_QUARANTINE_SOFT_QUARANTINE.md',
  },
];

export function countLossTouchpointsByStatus(
  status: LossQuarantineTouchpointStatus,
): number {
  return LOSS_QUARANTINE_TOUCHPOINT_REGISTRY.filter((t) => t.status === status).length;
}
