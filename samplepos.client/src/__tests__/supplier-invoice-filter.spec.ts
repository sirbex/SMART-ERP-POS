/**
 * Supplier Invoice Tab — Search, Filter & Pagination Tests
 *
 * These tests verify the pure logic extracted from SupplierDetailModal:
 *  - filterInvoices  (search by invoice# / ref, filter by status)
 *  - paginateInvoices (slice to PAGE_SIZE chunks)
 *  - invoiceTotalPages (ceil division, minimum 1)
 *
 * No React rendering needed — logic is extracted inline so it can be
 * tested in isolation without a DOM environment.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror of SupplierInvoiceSummary from SuppliersPage.tsx
// ---------------------------------------------------------------------------
interface SupplierInvoiceSummary {
    id: string;
    invoiceNumber: string;
    supplierInvoiceNumber: string | null;
    supplierId: string;
    invoiceDate: string;
    dueDate: string | null;
    totalAmount: number;
    amountPaid: number;
    outstandingBalance: number;
    status: string;
    lineItemCount: number;
}

// ---------------------------------------------------------------------------
// Inline the pure logic from SupplierDetailModal (filteredInvoices +
// paginatedInvoices + invoiceTotalPages).  Keep in sync with SuppliersPage.tsx.
// ---------------------------------------------------------------------------
const PAGE_SIZE = 25;

function filterInvoices(
    invoices: SupplierInvoiceSummary[],
    search: string,
    statusFilter: string,
): SupplierInvoiceSummary[] {
    let result = invoices;
    const q = search.trim().toLowerCase();
    if (q) {
        result = result.filter(
            (inv) =>
                inv.invoiceNumber?.toLowerCase().includes(q) ||
                (inv.supplierInvoiceNumber ?? '').toLowerCase().includes(q),
        );
    }
    if (statusFilter) {
        result = result.filter((inv) => inv.status === statusFilter);
    }
    return result;
}

function totalPages(filteredCount: number): number {
    return Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
}

function paginate(
    filtered: SupplierInvoiceSummary[],
    page: number,
): SupplierInvoiceSummary[] {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
}

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
function makeInvoice(
    overrides: Partial<SupplierInvoiceSummary> & { id: string; invoiceNumber: string },
): SupplierInvoiceSummary {
    return {
        supplierId: 'supplier-1',
        supplierInvoiceNumber: null,
        invoiceDate: '2025-01-01',
        dueDate: null,
        totalAmount: 100000,
        amountPaid: 0,
        outstandingBalance: 100000,
        status: 'Pending',
        lineItemCount: 1,
        ...overrides,
    };
}

/** Build N invoices with sequential IDs and invoice numbers. */
function makeInvoices(count: number, status = 'Pending'): SupplierInvoiceSummary[] {
    return Array.from({ length: count }, (_, i) =>
        makeInvoice({ id: `inv-${i + 1}`, invoiceNumber: `INV-${String(i + 1).padStart(5, '0')}`, status }),
    );
}

const SAMPLE: SupplierInvoiceSummary[] = [
    makeInvoice({ id: '1', invoiceNumber: 'INV-00001', status: 'Paid', amountPaid: 200000, outstandingBalance: 0, totalAmount: 200000 }),
    makeInvoice({ id: '2', invoiceNumber: 'INV-00002', status: 'Pending', totalAmount: 50000 }),
    makeInvoice({ id: '3', invoiceNumber: 'INV-00003', status: 'PartiallyPaid', amountPaid: 30000, outstandingBalance: 70000, totalAmount: 100000 }),
    makeInvoice({ id: '4', invoiceNumber: 'INV-00004', status: 'Overdue', totalAmount: 80000 }),
    makeInvoice({ id: '5', invoiceNumber: 'INV-00005', status: 'Cancelled', totalAmount: 10000 }),
    makeInvoice({ id: '6', invoiceNumber: 'SUPP-REF-9', supplierInvoiceNumber: 'EXT-REF-42', status: 'Pending', totalAmount: 60000 }),
];

// ===========================================================================
// SEARCH TESTS
// ===========================================================================
describe('Supplier Invoice search', () => {
    it('returns all invoices when search is empty', () => {
        expect(filterInvoices(SAMPLE, '', '')).toHaveLength(SAMPLE.length);
    });

    it('matches invoice number (exact prefix)', () => {
        const result = filterInvoices(SAMPLE, 'INV-00002', '');
        expect(result).toHaveLength(1);
        expect(result[0].invoiceNumber).toBe('INV-00002');
    });

    it('matches invoice number (partial, case-insensitive)', () => {
        const result = filterInvoices(SAMPLE, 'inv-0000', '');
        // INV-00001..INV-00005 all match; SUPP-REF-9 does not
        expect(result).toHaveLength(5);
    });

    it('matches supplierInvoiceNumber (external ref)', () => {
        const result = filterInvoices(SAMPLE, 'ext-ref', '');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('6');
    });

    it('is case-insensitive for invoice number', () => {
        const result = filterInvoices(SAMPLE, 'inv-00003', '');
        expect(result).toHaveLength(1);
        expect(result[0].invoiceNumber).toBe('INV-00003');
    });

    it('returns empty array when no invoice matches query', () => {
        expect(filterInvoices(SAMPLE, 'NOMATCH-9999', '')).toHaveLength(0);
    });

    it('trims whitespace from search query', () => {
        const result = filterInvoices(SAMPLE, '  INV-00001  ', '');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('handles null supplierInvoiceNumber without throwing', () => {
        const inv = makeInvoice({ id: 'x', invoiceNumber: 'INV-X', supplierInvoiceNumber: null });
        expect(() => filterInvoices([inv], 'ext-ref', '')).not.toThrow();
        expect(filterInvoices([inv], 'ext-ref', '')).toHaveLength(0);
    });
});

// ===========================================================================
// STATUS FILTER TESTS
// ===========================================================================
describe('Supplier Invoice status filter', () => {
    it('returns all invoices when status filter is empty', () => {
        expect(filterInvoices(SAMPLE, '', '')).toHaveLength(SAMPLE.length);
    });

    it('filters to Paid only', () => {
        const result = filterInvoices(SAMPLE, '', 'Paid');
        expect(result.every((i) => i.status === 'Paid')).toBe(true);
        expect(result).toHaveLength(1);
    });

    it('filters to Pending only', () => {
        const result = filterInvoices(SAMPLE, '', 'Pending');
        expect(result.every((i) => i.status === 'Pending')).toBe(true);
        expect(result).toHaveLength(2); // INV-00002 + SUPP-REF-9
    });

    it('filters to PartiallyPaid only', () => {
        const result = filterInvoices(SAMPLE, '', 'PartiallyPaid');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('3');
    });

    it('filters to Overdue only', () => {
        const result = filterInvoices(SAMPLE, '', 'Overdue');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('4');
    });

    it('filters to Cancelled only', () => {
        const result = filterInvoices(SAMPLE, '', 'Cancelled');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('5');
    });

    it('returns empty array when no invoices match status', () => {
        const result = filterInvoices(SAMPLE, '', 'Voided');
        expect(result).toHaveLength(0);
    });
});

// ===========================================================================
// COMBINED SEARCH + STATUS FILTER TESTS
// ===========================================================================
describe('Supplier Invoice combined search + status filter', () => {
    it('applies both search and status together (AND logic)', () => {
        // Search "INV-0000" matches 5 invoices; status "Paid" matches 1 → intersection = 1
        const result = filterInvoices(SAMPLE, 'INV-0000', 'Paid');
        expect(result).toHaveLength(1);
        expect(result[0].invoiceNumber).toBe('INV-00001');
    });

    it('returns empty when search matches but status does not', () => {
        const result = filterInvoices(SAMPLE, 'INV-00002', 'Paid'); // INV-00002 is Pending
        expect(result).toHaveLength(0);
    });

    it('returns empty when status matches but search does not', () => {
        const result = filterInvoices(SAMPLE, 'NOMATCH', 'Pending');
        expect(result).toHaveLength(0);
    });
});

// ===========================================================================
// TOTAL PAGES TESTS
// ===========================================================================
describe('Invoice totalPages', () => {
    it('returns 1 when there are no invoices', () => {
        expect(totalPages(0)).toBe(1);
    });

    it('returns 1 when invoices fit on one page', () => {
        expect(totalPages(PAGE_SIZE)).toBe(1);
        expect(totalPages(1)).toBe(1);
        expect(totalPages(24)).toBe(1);
    });

    it('returns 2 when there are 26 invoices', () => {
        expect(totalPages(26)).toBe(2);
    });

    it('returns correct page count for exactly divisible count', () => {
        expect(totalPages(PAGE_SIZE * 3)).toBe(3);
    });

    it('rounds up fractional page count', () => {
        expect(totalPages(PAGE_SIZE * 2 + 1)).toBe(3);
    });
});

// ===========================================================================
// PAGINATION TESTS
// ===========================================================================
describe('Invoice pagination', () => {
    it('returns first 25 on page 1 when more than 25 exist', () => {
        const invoices = makeInvoices(60);
        const page = paginate(invoices, 1);
        expect(page).toHaveLength(PAGE_SIZE);
        expect(page[0].id).toBe('inv-1');
        expect(page[PAGE_SIZE - 1].id).toBe(`inv-${PAGE_SIZE}`);
    });

    it('returns correct slice on page 2', () => {
        const invoices = makeInvoices(60);
        const page = paginate(invoices, 2);
        expect(page).toHaveLength(PAGE_SIZE);
        expect(page[0].id).toBe(`inv-${PAGE_SIZE + 1}`);
    });

    it('returns remaining items on the last page (partial page)', () => {
        const invoices = makeInvoices(27);
        const page = paginate(invoices, 2);
        expect(page).toHaveLength(2); // 27 - 25 = 2
        expect(page[0].id).toBe('inv-26');
        expect(page[1].id).toBe('inv-27');
    });

    it('returns empty array for out-of-range page', () => {
        const invoices = makeInvoices(10);
        const page = paginate(invoices, 2);
        expect(page).toHaveLength(0);
    });

    it('returns all items when count is less than page size', () => {
        const invoices = makeInvoices(5);
        const page = paginate(invoices, 1);
        expect(page).toHaveLength(5);
    });

    it('returns empty array when invoice list is empty', () => {
        const page = paginate([], 1);
        expect(page).toHaveLength(0);
    });
});

// ===========================================================================
// INTEGRATION: filter → paginate pipeline
// ===========================================================================
describe('Supplier Invoice filter → paginate pipeline', () => {
    it('paginating filtered results only pages through matching invoices', () => {
        // 30 Pending + 10 Paid = 40 total; filter to Pending → 30 → 2 pages
        const pending = makeInvoices(30, 'Pending');
        const paid = makeInvoices(10, 'Paid').map((inv, i) => ({ ...inv, id: `paid-${i}`, invoiceNumber: `PAID-${i}` }));
        const all = [...pending, ...paid];

        const filtered = filterInvoices(all, '', 'Pending');
        expect(filtered).toHaveLength(30);
        expect(totalPages(filtered.length)).toBe(2);

        const page1 = paginate(filtered, 1);
        const page2 = paginate(filtered, 2);
        expect(page1).toHaveLength(PAGE_SIZE);
        expect(page2).toHaveLength(5); // 30 - 25
        expect([...page1, ...page2]).toHaveLength(30);
        expect([...page1, ...page2].every((i) => i.status === 'Pending')).toBe(true);
    });

    it('changing search resets to page 1 effectively (filtered count changes)', () => {
        const invoices = makeInvoices(50, 'Pending');
        // Broad search → 50 results
        const broadFiltered = filterInvoices(invoices, 'INV', '');
        expect(broadFiltered).toHaveLength(50);

        // Narrow search → 1 result; page 1 returns it, page 2 returns nothing
        const narrowFiltered = filterInvoices(invoices, 'INV-00001', '');
        expect(paginate(narrowFiltered, 1)).toHaveLength(1);
        expect(paginate(narrowFiltered, 2)).toHaveLength(0);
    });

    it('filter + search reduces count fed into paginator', () => {
        const invoices = [
            ...makeInvoices(20, 'Paid'),
            ...makeInvoices(20, 'Pending').map((inv, i) => ({ ...inv, id: `p-${i}`, invoiceNumber: `PEND-${i}` })),
        ];
        const filtered = filterInvoices(invoices, 'PEND', 'Pending');
        expect(filtered).toHaveLength(20);
        expect(paginate(filtered, 1)).toHaveLength(20); // all fit on one page
        expect(totalPages(filtered.length)).toBe(1);
    });
});
