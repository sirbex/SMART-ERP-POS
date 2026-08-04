/**
 * Kitchen Production shared types — ADR-005 Phase 1.
 * Pure contracts; no inventory ownership.
 */

export type KitchenProductionDocumentType = 'PRODUCTION_BATCH';

/** First-class modes; Phase 1 only persists COOK_TO_STOCK. */
export type KitchenProductionMode = 'COOK_TO_ORDER' | 'COOK_TO_STOCK' | 'COOK_TO_SESSION';

export type KitchenProductionStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export const KITCHEN_PRODUCTION_PHASE1_MODES: readonly KitchenProductionMode[] = [
  'COOK_TO_STOCK',
] as const;

export const KITCHEN_PRODUCTION_DOCUMENT_TYPES_PHASE1: readonly KitchenProductionDocumentType[] = [
  'PRODUCTION_BATCH',
] as const;

export interface KitchenProductionComponentLineInput {
  productId: string;
  plannedQtyBase: number;
  actualQtyBase: number;
  sortOrder?: number;
}

export interface KitchenProductionDraftInput {
  productionDate?: string;
  storeLocationId?: string | null;
  outputProductId: string;
  outputQtyBase: number;
  outputLotNumber?: string | null;
  notes?: string | null;
  lines: KitchenProductionComponentLineInput[];
  productionMode?: KitchenProductionMode;
  documentType?: KitchenProductionDocumentType;
}

export interface KitchenProductionComponentLine {
  id: string;
  documentId: string;
  productId: string;
  productName?: string;
  plannedQtyBase: number;
  actualQtyBase: number;
  actualUnitCost: number | null;
  actualLineCost: number | null;
  sortOrder: number;
}

export interface KitchenProductionDocument {
  id: string;
  documentNumber: string;
  documentType: KitchenProductionDocumentType;
  productionMode: KitchenProductionMode;
  status: KitchenProductionStatus;
  productionDate: string;
  storeLocationId: string | null;
  outputProductId: string;
  outputProductName?: string;
  outputQtyBase: number;
  outputLotNumber: string | null;
  outputInventoryBatchId: string | null;
  totalIngredientCost: number;
  outputUnitCost: number;
  notes: string | null;
  journalEntryId: string | null;
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  lines: KitchenProductionComponentLine[];
}
