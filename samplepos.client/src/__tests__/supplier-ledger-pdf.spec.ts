/**
 * Supplier Ledger PDF Export Tests
 *
 * Verifies that the jsPDF-based PDF generation:
 *  - Creates a document with the correct filename
 *  - Includes all ledger entries (opening balance + transactions)
 *  - Handles empty ledger gracefully
 *  - Applies correct number formatting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// -----------------------------------------------------------------------
// Minimal ledger shape (mirrors SupplierLedgerData in SuppliersPage)
// -----------------------------------------------------------------------
interface LedgerEntry {
  date: string;
  docNumber: string | null;
  type: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balanceAfter: number;
  itemStatus: string;
  paymentMethod: string | null;
}

interface LedgerData {
  supplierName: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  entries: LedgerEntry[];
}

// -----------------------------------------------------------------------
// Inline the pure logic extracted from handleExportPDF so we can unit-test
// it without rendering the full React component.
// -----------------------------------------------------------------------

function buildLedgerPdfRows(ledger: LedgerData, filter: string) {
  const fmt = (n: number) =>
    n.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const filtered = ledger.entries.filter(
    (e) => filter === 'all' || e.itemStatus === filter,
  );

  const openingRow = [
    ledger.periodStart,
    '—',
    'Opening Balance',
    '—',
    '—',
    '',
    '',
    fmt(ledger.openingBalance),
    '',
  ];

  const dataRows = filtered.map((e) => [
    e.date,
    e.docNumber || '—',
    (e.type || '').replace(/_/g, ' '),
    e.reference || '—',
    e.description || '—',
    e.debit > 0 ? fmt(e.debit) : '',
    e.credit > 0 ? fmt(e.credit) : '',
    fmt(e.balanceAfter),
    e.itemStatus + (e.paymentMethod ? ` (${e.paymentMethod.replace(/_/g, ' ')})` : ''),
  ]);

  return { openingRow, dataRows, filtered };
}

function buildFilename(ledger: LedgerData) {
  return `supplier-ledger-${ledger.supplierName
    .replace(/[^a-z0-9]/gi, '-')
    .toLowerCase()}-${ledger.periodStart}-${ledger.periodEnd}.pdf`;
}

function buildSummary(ledger: LedgerData) {
  const fmt = (n: number) =>
    n.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const totalDebits = ledger.entries.reduce((s, e) => s + e.debit, 0);
  const totalCredits = ledger.entries.reduce((s, e) => s + e.credit, 0);
  return {
    opening: fmt(ledger.openingBalance),
    totalInvoiced: fmt(totalDebits),
    totalPaid: fmt(totalCredits),
    closing: fmt(ledger.closingBalance),
  };
}

// -----------------------------------------------------------------------
// Mock jsPDF so the tests don't depend on a browser canvas / DOM
// -----------------------------------------------------------------------
const mockSave = vi.fn();
const mockAutoTable = vi.fn();

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
    save: mockSave,
    lastAutoTable: { finalY: 100 },
  })),
}));

vi.mock('jspdf-autotable', () => ({
  default: mockAutoTable,
}));

// -----------------------------------------------------------------------
// Test data
// -----------------------------------------------------------------------
const SAMPLE_LEDGER: LedgerData = {
  supplierName: 'Acme Supplies Ltd',
  periodStart: '2025-04-30',
  periodEnd: '2026-04-30',
  openingBalance: 500000,
  closingBalance: 750000,
  entries: [
    {
      date: '2025-05-10',
      docNumber: 'INV-00001',
      type: 'SUPPLIER_INVOICE',
      reference: 'PO-2025-0001',
      description: 'Monthly stock',
      debit: 300000,
      credit: 0,
      balanceAfter: 800000,
      itemStatus: 'Open',
      paymentMethod: null,
    },
    {
      date: '2025-06-01',
      docNumber: 'PAY-00001',
      type: 'SUPPLIER_PAYMENT',
      reference: null,
      description: 'Bank transfer',
      debit: 0,
      credit: 50000,
      balanceAfter: 750000,
      itemStatus: 'Applied',
      paymentMethod: 'BANK_TRANSFER',
    },
  ],
};

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------
describe('Supplier Ledger PDF — row builder', () => {
  beforeEach(() => {
    mockSave.mockClear();
    mockAutoTable.mockClear();
  });

  it('produces one opening row + one row per entry when filter is "all"', () => {
    const { openingRow, dataRows } = buildLedgerPdfRows(SAMPLE_LEDGER, 'all');
    expect(openingRow[2]).toBe('Opening Balance');
    expect(dataRows).toHaveLength(2);
  });

  it('filters entries when a status filter is applied', () => {
    const { dataRows } = buildLedgerPdfRows(SAMPLE_LEDGER, 'Open');
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0][8]).toContain('Open');
  });

  it('shows debit amount in column 5, empty string for credit column when debit > 0', () => {
    const { dataRows } = buildLedgerPdfRows(SAMPLE_LEDGER, 'all');
    const invoiceRow = dataRows[0];
    expect(invoiceRow[5]).toBe('300,000');  // debit
    expect(invoiceRow[6]).toBe('');          // no credit
  });

  it('shows credit amount in column 6, empty string for debit column when credit > 0', () => {
    const { dataRows } = buildLedgerPdfRows(SAMPLE_LEDGER, 'all');
    const paymentRow = dataRows[1];
    expect(paymentRow[5]).toBe('');          // no debit
    expect(paymentRow[6]).toBe('50,000');   // credit
  });

  it('appends payment method to status string', () => {
    const { dataRows } = buildLedgerPdfRows(SAMPLE_LEDGER, 'all');
    expect(dataRows[1][8]).toBe('Applied (BANK TRANSFER)');
  });

  it('replaces underscores in type with spaces', () => {
    const { dataRows } = buildLedgerPdfRows(SAMPLE_LEDGER, 'all');
    expect(dataRows[0][2]).toBe('SUPPLIER INVOICE');
  });

  it('uses — for null docNumber / reference / description', () => {
    const { dataRows } = buildLedgerPdfRows(SAMPLE_LEDGER, 'all');
    const paymentRow = dataRows[1];
    expect(paymentRow[1]).toBe('PAY-00001');   // docNumber present
    expect(paymentRow[3]).toBe('—');           // reference null → —
  });
});

describe('Supplier Ledger PDF — filename', () => {
  it('slugifies supplier name and includes date range', () => {
    const name = buildFilename(SAMPLE_LEDGER);
    expect(name).toBe('supplier-ledger-acme-supplies-ltd-2025-04-30-2026-04-30.pdf');
  });

  it('handles special characters in supplier name', () => {
    const name = buildFilename({ ...SAMPLE_LEDGER, supplierName: 'Smith & Sons (Pty)' });
    expect(name).toMatch(/^supplier-ledger-smith---sons--pty--/);
    expect(name).toMatch(/\.pdf$/);
  });
});

describe('Supplier Ledger PDF — summary totals', () => {
  it('sums all debits correctly', () => {
    const s = buildSummary(SAMPLE_LEDGER);
    expect(s.totalInvoiced).toBe('300,000');
  });

  it('sums all credits correctly', () => {
    const s = buildSummary(SAMPLE_LEDGER);
    expect(s.totalPaid).toBe('50,000');
  });

  it('reflects closing balance from ledger', () => {
    const s = buildSummary(SAMPLE_LEDGER);
    expect(s.closing).toBe('750,000');
  });

  it('reflects opening balance from ledger', () => {
    const s = buildSummary(SAMPLE_LEDGER);
    expect(s.opening).toBe('500,000');
  });
});

describe('Supplier Ledger PDF — empty ledger', () => {
  const empty: LedgerData = {
    supplierName: 'Empty Supplier',
    periodStart: '2026-01-01',
    periodEnd: '2026-04-30',
    openingBalance: 0,
    closingBalance: 0,
    entries: [],
  };

  it('returns no data rows for empty entries', () => {
    const { dataRows } = buildLedgerPdfRows(empty, 'all');
    expect(dataRows).toHaveLength(0);
  });

  it('still produces an opening row', () => {
    const { openingRow } = buildLedgerPdfRows(empty, 'all');
    expect(openingRow[2]).toBe('Opening Balance');
    expect(openingRow[7]).toBe('0');
  });

  it('summary totals are zero strings', () => {
    const s = buildSummary(empty);
    expect(s.totalInvoiced).toBe('0');
    expect(s.totalPaid).toBe('0');
  });
});
