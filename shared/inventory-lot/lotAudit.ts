import type { LotAttributes, LotDate } from './lotTypes.js';

export interface LotAuditRecord {
  id?: string;
  lotId: string;
  lotNumber: string;
  productId: string;
  productName?: string | null;
  oldAttributes: Partial<LotAttributes>;
  newAttributes: Partial<LotAttributes>;
  changedById: string;
  changedByName: string;
  reason: string;
  changedAt?: string;
  ipAddress?: string | null;
}

export interface LotExpiryAuditRecord {
  lotId: string;
  lotNumber: string;
  productId: string;
  productName?: string | null;
  oldExpiryDate: LotDate | null;
  newExpiryDate: LotDate;
  changedById: string;
  changedByName: string;
  reason: string;
  changedAt?: string;
  ipAddress?: string | null;
}

export const LOT_AUDIT_REASON_CODES = {
  SUPPLIER_CORRECTION: 'SUPPLIER_CORRECTION',
  LAB_RETEST: 'LAB_RETEST',
  DATA_ENTRY_FIX: 'DATA_ENTRY_FIX',
  REGULATORY: 'REGULATORY',
  OTHER: 'OTHER',
} as const;

export type LotAuditReasonCode = (typeof LOT_AUDIT_REASON_CODES)[keyof typeof LOT_AUDIT_REASON_CODES];
