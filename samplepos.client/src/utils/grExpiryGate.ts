/** GR expiry validation — product-driven (trackExpiry), never global. */

export function grItemTrackExpiry(item: {
  trackExpiry?: boolean;
  track_expiry?: boolean;
}): boolean {
  return !!(item.trackExpiry ?? item.track_expiry);
}

export function grLineExpiryRequired(trackExpiry: boolean, receivedQty: number): boolean {
  return trackExpiry && receivedQty > 0;
}

export function grLineExpirySatisfied(
  trackExpiry: boolean,
  receivedQty: number,
  expiryDate?: string | null,
): boolean {
  if (!grLineExpiryRequired(trackExpiry, receivedQty)) return true;
  return !!(expiryDate && String(expiryDate).trim());
}
