import type { LotDate, SelectionPolicy } from './lotTypes.js';

/** Lot row available for selection (in-memory / query result) */
export interface SelectableLot {
  lotId: string;
  lotNumber: string;
  productId: string;
  remainingQuantity: number;
  costPrice: number;
  expiryDate?: LotDate | null;
  receivedDate?: LotDate | null;
  storeLocationId?: string | null;
  /** Multistore projection row — required for store-scoped balance deduction */
  productLotId?: string | null;
}

export interface LotSelectionRequest {
  policy: SelectionPolicy;
  lots: SelectableLot[];
  quantity: number;
  businessDate: LotDate;
  minDaysBeforeExpirySale?: number;
  specificLotId?: string | null;
}

export interface LotSelectionLayer {
  lotId: string;
  lotNumber: string;
  quantity: number;
  costPrice: number;
  expiryDate?: LotDate | null;
}

export interface LotSelectionResult {
  policy: SelectionPolicy;
  layers: LotSelectionLayer[];
  totalAllocated: number;
  totalCost: number;
  shortfall: number;
}

export interface ILotSelectionPolicy {
  readonly policy: SelectionPolicy;
  select(request: LotSelectionRequest): LotSelectionResult;
}

export function emptySelectionResult(policy: SelectionPolicy, requestedQuantity = 0): LotSelectionResult {
  return {
    policy,
    layers: [],
    totalAllocated: 0,
    totalCost: 0,
    shortfall: Math.max(0, requestedQuantity),
  };
}
