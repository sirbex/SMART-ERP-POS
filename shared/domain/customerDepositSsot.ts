/**
 * Customer transaction identity SSOT — MUST rules (deposits, store credits, similar).
 *
 * Money / liability moves are anchored to a real customer row (id → customers table).
 * Paginated list APIs are browse/pick only — never identity, never save gate.
 *
 * Name resolution order (UI display only; server re-loads name from DB on post when API exists):
 *   1. Bound context (customer detail / modal already loaded)
 *   2. GET /customers/:id (master data SSOT)
 *   3. Module balance/summary APIs that join customers.name
 *
 * FORBIDDEN permanently:
 *   - customers.find(id) from useCustomers(page, limit) to authorize Save
 *   - Fallback "Unknown" when customerId is known and master is loadable
 *   - Treating page-1 of customers as the full customer universe
 */

export const CUSTOMER_DEPOSIT_IDENTITY_SSOT = {
  /** Write-path identity: UUID validated against customers via findCustomerById when API */
  writeIdentity: 'customers.id (bound prop or picker selection → master GET)',
  /** UI name sources (ordered) */
  displayNameSources: [
    'bound.customerName',
    'GET customers/:id .name',
    'GET deposits/customer/:id/balance .customerName',
  ] as const,
  /** List APIs may only feed a picker; never identity or save */
  listApiRole: 'browse_picker_only' as const,
  appliesTo: ['CustomerDeposits', 'StoreCredits'] as const,
  forbidden: [
    'Paginated customer list as save gate',
    'Name from list page slice when customerId is bound',
    'Hard-coded Unknown when customerId is known',
  ] as const,
} as const;

/**
 * True when a customer id is present enough to attempt a customer-bound write
 * (deposit, store credit, etc.). List membership is never required.
 */
export function canActOnCustomerId(customerId: string | null | undefined): boolean {
  return typeof customerId === 'string' && customerId.trim().length > 0;
}

/** @deprecated Use canActOnCustomerId — same rule. */
export const canPostCustomerDeposit = canActOnCustomerId;

/**
 * Resolve display name — list page names are NOT accepted as SSOT.
 * Server still loads master name on POST where an API exists; this is presentation only.
 */
export function resolveCustomerDisplayName(args: {
  boundName?: string | null;
  masterName?: string | null;
  balanceName?: string | null;
}): string | null {
  for (const raw of [args.boundName, args.masterName, args.balanceName]) {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (t && t.toLowerCase() !== 'unknown') return t;
  }
  return null;
}

/** @deprecated Use resolveCustomerDisplayName — same order. */
export const resolveCustomerDepositDisplayName = resolveCustomerDisplayName;

/** Anti-patterns for structural / source gates (must not reappear on any customer money UI). */
export const FORBIDDEN_CUSTOMER_DEPOSIT_CLIENT_PATTERNS = [
  /customers\.find\s*\([^)]*\)[\s\S]{0,80}Please select a customer/,
  /customers\.find\s*\([^)]*\)\s*\?\.name\s*\|\|\s*['"]Unknown['"]/,
  /useCustomers\s*\(\s*1\s*,\s*100\s*\)[\s\S]{0,400}customers\.find/,
] as const;
