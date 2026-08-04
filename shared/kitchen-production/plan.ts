/**
 * Pure Kitchen Production planners (ADR-005).
 * No DB / inventory side effects.
 */

import type {
  KitchenProductionDocumentType,
  KitchenProductionMode,
  KitchenProductionStatus,
} from './types.js';
import {
  KITCHEN_PRODUCTION_DOCUMENT_TYPES_PHASE1,
  KITCHEN_PRODUCTION_PHASE1_MODES,
} from './types.js';

export function isPhase1ProductionMode(mode: string): mode is KitchenProductionMode {
  return (KITCHEN_PRODUCTION_PHASE1_MODES as readonly string[]).includes(mode);
}

export function isPhase1DocumentType(type: string): type is KitchenProductionDocumentType {
  return (KITCHEN_PRODUCTION_DOCUMENT_TYPES_PHASE1 as readonly string[]).includes(type);
}

/** Cook-to-order stays on sale path — never post as production batch. */
export function assertPostableMode(mode: KitchenProductionMode): void {
  if (mode === 'COOK_TO_ORDER') {
    throw new Error(
      'COOK_TO_ORDER uses existing Restaurant pay-time recipe explosion; do not post a Production Batch.',
    );
  }
  if (mode === 'COOK_TO_SESSION') {
    throw new Error(
      'COOK_TO_SESSION uses Buffet Session capacity docs + cover sales, not Production Batch post.',
    );
  }
  if (!isPhase1ProductionMode(mode)) {
    throw new Error(`Unsupported production mode for Phase 1: ${mode}`);
  }
}

export function canEditStatus(status: KitchenProductionStatus): boolean {
  return status === 'DRAFT';
}

export function canPostStatus(status: KitchenProductionStatus): boolean {
  return status === 'DRAFT';
}

export function canCancelStatus(status: KitchenProductionStatus): boolean {
  return status === 'DRAFT';
}

/**
 * FG unit cost = total ingredient cost / output qty (SAP-style batch cost roll-up).
 * Returns 0 if output qty invalid (caller should validate separately).
 */
export function computeOutputUnitCost(
  totalIngredientCost: number,
  outputQtyBase: number,
): number {
  if (!(outputQtyBase > 0) || !Number.isFinite(outputQtyBase)) return 0;
  if (!(totalIngredientCost >= 0) || !Number.isFinite(totalIngredientCost)) return 0;
  return totalIngredientCost / outputQtyBase;
}

/**
 * Scale recipe line qty_base (per 1 parent unit) by output batch size.
 */
export function scaleRecipeComponentQty(
  quantityBasePerUnit: number,
  outputQtyBase: number,
): number {
  if (!(quantityBasePerUnit > 0) || !(outputQtyBase > 0)) return 0;
  return quantityBasePerUnit * outputQtyBase;
}
