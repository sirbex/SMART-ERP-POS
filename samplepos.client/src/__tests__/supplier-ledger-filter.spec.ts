/**
 * Supplier Ledger Tab — Search, Status Filter & Pagination Tests
 *
 * Tests the pure logic extracted from SupplierDetailModal:
 *  - filterLedgerEntries  (status pill + text search across docNumber / reference / description / type)
 *  - paginateLedgerEntries (25/page slicing)
 *  - ledgerTotalPages     (ceil division, min 1)
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror of SupplierLedgerEntry from SuppliersPage.tsx
// ---------------------------------------------------------------------------
interface LedgerEntry {
  date: string;
  docNumber: string | null;
  type: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balanceAfter: number;
  itemStatus: 'Open' | 'Applied' | 'Return' | 'Voided';
  paymentMethod?: string | null;
}

// ---------------------------------------------------------------------------
// Inline the pure logic from SupplierDetailModal (filteredLedgerEntries +
// paginatedLedgerEntries + ledgerTotalPages). Keep in sync with SuppliersPage.tsx.
// ---------------------------------------------------------------------------
const PAGE_SIZE = 25;

type StatusFilter = 'all' | 'Open' | 'Return' | 'Applied' | 'Voided';

function filterLedgerEntries(
  entries: LedgerEntry[],
  statusFilter: StatusFilter,
  search: string,
): LedgerEntry[] {
  let result = entries;
  if (statusFilter !== 'all') {
    result = result.filter((e) => e.itemStatus === statusFilter);
  }
  const q = search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (e) =>
        (e.docNumber ?? '').toLowerCase().includes(q) ||
        (e.reference ?? '').toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q) ||
        (e.type ?? '').toLowerCase().includes(q),
    );
  }
  return result;
}

function totalPages(filteredCount: number): number {
  return Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
}

function paginate(entries: LedgerEntry[], page: number): LedgerEntry[] {
  const start = (page - 1) * PAGE_SIZE;
  return entries.slice(start, start + PAGE_SIZE);
}

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
function makeEntry(overrides: Partial<LedgerEntry> & { itemStatus: LedgerEntry['itemStatus'] }): LedgerEntry {
  return {
    date: '2025-05-01',
    docNumber: null,
    type: 'SUPPLIER_INVOICE',
    reference: null,
    description: null,
    debit: 100000,
    credit: 0,
    balanceAfter: 100000,
    paymentMethod: null,
    ...overrides,
  };
}

function makeEntries(count: number, status: LedgerEntry['itemStatus'] = 'Open'): LedgerEntry[] {
  return Array.from({ length: count }, (_, i) =>
    makeEntry({
      itemStatus: status,
      docNumber: `INV-${String(i + 1).padStart(5, '0')}`,
      reference: `REF-${i + 1}`,
      description: `Purchase order ${i + 1}`,
    }),
  );
}

const SAMPLE: LedgerEntry[] = [
  makeEntry({ itemStatus: 'Open',    docNumber: 'INV-00001', reference: 'PO-001', description: 'Pharma supplies',    type: 'SUPPLIER_INVOICE', debit: 200000 }),
  makeEntry({ itemStatus: 'Applied', docNumber: 'PMT-00001', reference: 'PO-001', description: 'Payment received',   type: 'SUPPLIER_PAYMENT', credit: 200000, debit: 0 }),
  makeEntry({ itemStatus: 'Open',    docNumber: 'INV-00002', reference: 'PO-002', description: 'Office equipment',   type: 'SUPPLIER_INVOICE', debit: 80000 }),
  makeEntry({ itemStatus: 'Return',  docNumber: 'RET-00001', reference: 'PO-002', description: 'Return of goods',    type: 'SUPPLIER_RETURN',  credit: 20000, debit: 0 }),
  makeEntry({ itemStatus: 'Voided',  docNumber: 'INV-00003', reference: 'PO-003', description: 'Voided invoice',     type: 'SUPPLIER_INVOICE', debit: 0 }),
  makeEntry({ itemStatus: 'Open',    docNumber: 'INV-00004', reference: null,     description: null,                 type: 'SUPPLIER_INVOICE', debit: 50000 }),
];

// ===========================================================================
// STATUS FILTER TESTS
// ===========================================================================
describe('Ledger status filter', () => {
  it('returns all entries when filter is "all"', () => {
    expect(filterLedgerEntries(SAMPLE, 'all', '')).toHaveLength(SAMPLE.length);
  });

  it('returns only Open entries', () => {
    const result = filterLedgerEntries(SAMPLE, 'Open', '');
    expect(result.every((e) => e.itemStatus === 'Open')).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('returns only Applied entries', () => {
    const result = filterLedgerEntries(SAMPLE, 'Applied', '');
    expect(result).toHaveLength(1);
    expect(result[0].docNumber).toBe('PMT-00001');
  });

  it('returns only Return entries', () => {
    const result = filterLedgerEntries(SAMPLE, 'Return', '');
    expect(result).toHaveLength(1);
    expect(result[0].docNumber).toBe('RET-00001');
  });

  it('returns only Voided entries', () => {
    const result = filterLedgerEntries(SAMPLE, 'Voided', '');
    expect(result).toHaveLength(1);
    expect(result[0].docNumber).toBe('INV-00003');
  });

  it('returns empty array when no entries match status', () => {
    const entries = makeEntries(5, 'Open');
    expect(filterLedgerEntries(entries, 'Applied', '')).toHaveLength(0);
  });

  it('handles empty entries list', () => {
    expect(filterLedgerEntries([], 'Open', '')).toHaveLength(0);
  });
});

// ===========================================================================
// SEARCH TESTS
// ===========================================================================
describe('Ledger search', () => {
  it('returns all entries when search is empty', () => {
    expect(filterLedgerEntries(SAMPLE, 'all', '')).toHaveLength(SAMPLE.length);
  });

  it('matches by docNumber (partial, case-insensitive)', () => {
    const result = filterLedgerEntries(SAMPLE, 'all', 'inv-000');
    // INV-00001, INV-00002, INV-00003, INV-00004 all match
    expect(result).toHaveLength(4);
  });

  it('matches exact docNumber', () => {
    const result = filterLedgerEntries(SAMPLE, 'all', 'PMT-00001');
    expect(result).toHaveLength(1);
    expect(result[0].docNumber).toBe('PMT-00001');
  });

  it('matches by reference', () => {
    const result = filterLedgerEntries(SAMPLE, 'all', 'PO-002');
    expect(result).toHaveLength(2); // INV-00002 + RET-00001 both ref PO-002
  });

  it('matches by description (partial)', () => {
    const result = filterLedgerEntries(SAMPLE, 'all', 'payment');
    expect(result).toHaveLength(1);
    expect(result[0].docNumber).toBe('PMT-00001');
  });

  it('matches by type (partial)', () => {
    const result = filterLedgerEntries(SAMPLE, 'all', 'supplier_return');
    expect(result).toHaveLength(1);
    expect(result[0].docNumber).toBe('RET-00001');
  });

  it('is case-insensitive', () => {
    const result = filterLedgerEntries(SAMPLE, 'all', 'PHARMA');
    expect(result).toHaveLength(1);
    expect(result[0].docNumber).toBe('INV-00001');
  });

  it('trims whitespace from query', () => {
    const result = filterLedgerEntries(SAMPLE, 'all', '  INV-00001  ');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when query matches nothing', () => {
    expect(filterLedgerEntries(SAMPLE, 'all', 'NOMATCH-9999')).toHaveLength(0);
  });

  it('handles null docNumber / reference / description without throwing', () => {
    const entry = makeEntry({ itemStatus: 'Open', docNumber: null, reference: null, description: null });
    expect(() => filterLedgerEntries([entry], 'all', 'anything')).not.toThrow();
    expect(filterLedgerEntries([entry], 'all', 'anything')).toHaveLength(0);
  });
});

// ===========================================================================
// COMBINED STATUS + SEARCH TESTS
// ===========================================================================
describe('Ledger combined status + search', () => {
  it('applies status filter then search (AND logic)', () => {
    // "Open" status = 3 entries; search "INV-00001" narrows to 1
    const result = filterLedgerEntries(SAMPLE, 'Open', 'INV-00001');
    expect(result).toHaveLength(1);
    expect(result[0].docNumber).toBe('INV-00001');
  });

  it('returns empty when status matches but search does not', () => {
    expect(filterLedgerEntries(SAMPLE, 'Open', 'PMT-')).toHaveLength(0);
  });

  it('returns empty when search matches but status does not', () => {
    // PMT-00001 is "Applied", not "Open"
    expect(filterLedgerEntries(SAMPLE, 'Open', 'PMT-00001')).toHaveLength(0);
  });
});

// ===========================================================================
// TOTAL PAGES TESTS
// ===========================================================================
describe('Ledger totalPages', () => {
  it('returns 1 when there are no entries', () => {
    expect(totalPages(0)).toBe(1);
  });

  it('returns 1 when entries fit on one page (≤ 25)', () => {
    expect(totalPages(1)).toBe(1);
    expect(totalPages(PAGE_SIZE)).toBe(1);
  });

  it('returns 2 for 26 entries', () => {
    expect(totalPages(26)).toBe(2);
  });

  it('rounds up fractional page count', () => {
    expect(totalPages(PAGE_SIZE * 2 + 1)).toBe(3);
  });

  it('returns exact count when divisible', () => {
    expect(totalPages(PAGE_SIZE * 4)).toBe(4);
  });
});

// ===========================================================================
// PAGINATION TESTS
// ===========================================================================
describe('Ledger pagination', () => {
  it('returns first 25 entries on page 1', () => {
    const entries = makeEntries(60);
    const page = paginate(entries, 1);
    expect(page).toHaveLength(PAGE_SIZE);
    expect(page[0].docNumber).toBe('INV-00001');
    expect(page[PAGE_SIZE - 1].docNumber).toBe(`INV-${String(PAGE_SIZE).padStart(5, '0')}`);
  });

  it('returns correct slice on page 2', () => {
    const entries = makeEntries(60);
    const page = paginate(entries, 2);
    expect(page).toHaveLength(PAGE_SIZE);
    expect(page[0].docNumber).toBe(`INV-${String(PAGE_SIZE + 1).padStart(5, '0')}`);
  });

  it('returns remaining items on last page (partial)', () => {
    const entries = makeEntries(27);
    expect(paginate(entries, 2)).toHaveLength(2);
  });

  it('returns empty array for out-of-range page', () => {
    const entries = makeEntries(10);
    expect(paginate(entries, 2)).toHaveLength(0);
  });

  it('returns all entries when fewer than page size', () => {
    const entries = makeEntries(5);
    expect(paginate(entries, 1)).toHaveLength(5);
  });

  it('returns empty array for empty entry list', () => {
    expect(paginate([], 1)).toHaveLength(0);
  });
});

// ===========================================================================
// INTEGRATION: filter → paginate pipeline
// ===========================================================================
describe('Ledger filter → paginate pipeline', () => {
  it('paginator operates on filtered entries only', () => {
    const open    = makeEntries(30, 'Open');
    const applied = makeEntries(15, 'Applied').map((e, i) => ({ ...e, docNumber: `PMT-${i}` }));
    const all = [...open, ...applied];

    const filtered = filterLedgerEntries(all, 'Open', '');
    expect(filtered).toHaveLength(30);
    expect(totalPages(filtered.length)).toBe(2);

    const p1 = paginate(filtered, 1);
    const p2 = paginate(filtered, 2);
    expect(p1).toHaveLength(25);
    expect(p2).toHaveLength(5);
    expect([...p1, ...p2].every((e) => e.itemStatus === 'Open')).toBe(true);
  });

  it('search after status filter further narrows results', () => {
    const entries = makeEntries(50, 'Open'); // all INV-00001..INV-00050
    const filtered = filterLedgerEntries(entries, 'Open', 'INV-00001');
    // Only INV-00001, INV-00010..INV-00019 start with INV-00001
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(totalPages(filtered.length)).toBe(1);
    expect(paginate(filtered, 1)).toHaveLength(filtered.length);
  });

  it('clearing search restores full filtered count', () => {
    const entries = makeEntries(30, 'Open');
    const narrowed = filterLedgerEntries(entries, 'Open', 'INV-00001');
    const full     = filterLedgerEntries(entries, 'Open', '');
    expect(full).toHaveLength(30);
    expect(narrowed.length).toBeLessThan(full.length);
  });
});
