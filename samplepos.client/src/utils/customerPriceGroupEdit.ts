/**
 * Shared customer price-group edit logic (CustomerDetailModal + CustomerDetailPage).
 * Keep in sync with pricing-customer-phases.test.ts.
 */

export type CustomerPriceGroupFields = {
  priceGroupId?: string | null;
  pricingMode?: 'STANDARD' | 'AT_COST' | null;
  isActive?: boolean;
  is_active?: boolean;
};

/** Safe for React useEffect deps — never throws while customer is still loading. */
export function priceGroupIdForEffectDeps(
  customer: CustomerPriceGroupFields | null | undefined,
): string | null | undefined {
  return customer?.priceGroupId;
}

export function syncEditPriceGroupState(customer: CustomerPriceGroupFields): {
  editValue: string;
  initialRef: string | null;
} {
  const pgId = customer.priceGroupId ?? '';
  return { editValue: pgId, initialRef: pgId || null };
}

export function buildCustomerUpdatePayload(
  initialPriceGroupId: string | null | undefined,
  editPriceGroupId: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...fields };
  const changed = editPriceGroupId !== (initialPriceGroupId ?? '');
  if (changed) {
    payload.priceGroupId = editPriceGroupId || null;
  }
  return payload;
}

export function customerIsAtCost(
  customer: CustomerPriceGroupFields | null | undefined,
): boolean {
  return customer?.pricingMode === 'AT_COST';
}

export function customerIsActive(
  customer: CustomerPriceGroupFields | null | undefined,
): boolean {
  if (!customer) return false;
  return customer.isActive ?? customer.is_active ?? false;
}

export function priceGroupLabel(
  customer: CustomerPriceGroupFields | null | undefined,
  priceGroups: Array<{ id: string; name: string }>,
): string {
  if (!customer) return '';
  if (customer.pricingMode === 'AT_COST') return 'At cost (0% margin)';
  if (customer.priceGroupId) {
    const pg = priceGroups.find((p) => p.id === customer.priceGroupId);
    return pg?.name ?? 'Standard pricing';
  }
  return 'Standard retail (no price group)';
}
