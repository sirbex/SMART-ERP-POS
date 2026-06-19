import { api } from './api';
import type { Customer } from '@shared/zod/customer';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when id is a persisted tenant customer row (not temp_/offline placeholder). */
export function isPersistedCustomerId(id: string | undefined): boolean {
  if (!id) return false;
  if (id.startsWith('temp_')) return false;
  if (id.startsWith('offline_cust_')) return false;
  return UUID_RE.test(id);
}

/**
 * POS must never post a sale with a visible customer but null customer_id.
 * Resolves temp_/missing IDs to a real customer row by exact name match.
 */
export async function resolvePosCustomerForSale(
  selected: Customer | null,
): Promise<{ customer: Customer | null; customerId: string | undefined; error?: string }> {
  if (!selected) {
    return { customer: null, customerId: undefined };
  }

  if (isPersistedCustomerId(selected.id)) {
    return { customer: selected, customerId: selected.id };
  }

  const name = selected.name?.trim();
  if (!name) {
    return {
      customer: selected,
      customerId: undefined,
      error: 'Selected customer has no valid database ID. Search and select the customer again.',
    };
  }

  try {
    const listRes = await api.customers.list({ limit: 500 });
    const all = (listRes.data?.data || []) as Customer[];
    const matched = all.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (matched && isPersistedCustomerId(matched.id)) {
      return { customer: matched, customerId: matched.id };
    }
  } catch {
    /* fall through */
  }

  return {
    customer: selected,
    customerId: undefined,
    error:
      `Customer "${name}" is shown on screen but is not linked to the database ` +
      `(temporary ID). Remove the customer, search for "${name}" in the customer list, and select again.`,
  };
}
