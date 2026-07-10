/** GR expiry validation — delegates to shared/inventory-lot (ADR-002). */
import {
  requiresExpiryOnReceipt,
  receiptExpirySatisfied,
} from '@shared/inventory-lot/lotRules.js';

export function grItemTrackExpiry(item: {
  trackExpiry?: boolean;
  track_expiry?: boolean;
}): boolean {
  return !!(item.trackExpiry ?? item.track_expiry);
}

export function grLineExpiryRequired(trackExpiry: boolean, receivedQty: number): boolean {
  return requiresExpiryOnReceipt({ trackExpiry }, receivedQty);
}

export function grLineExpirySatisfied(
  trackExpiry: boolean,
  receivedQty: number,
  expiryDate?: string | null,
): boolean {
  return receiptExpirySatisfied({ trackExpiry }, receivedQty, expiryDate ?? null);
}
