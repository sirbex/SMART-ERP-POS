/**
 * Supplier invoice PDF — SSOT via documentRenderer + supplierInvoiceBody.
 */
import { describe, it, expect } from '@jest/globals';
import { PassThrough } from 'stream';
import { createDocument, finalizeDocument, type DocumentMeta } from './baseDocumentLayout.js';
import type { DocumentTheme } from './documentTheme.js';
import { renderSupplierInvoiceBody, type SupplierInvoiceBodyData } from './bodies/supplierInvoiceBody.js';

function testTheme(): DocumentTheme {
  return {
    company: {
      name: 'Proof Pharma Ltd',
      address: 'Kampala',
      phone: '+256-700-000000',
      email: 'proof@example.com',
      tin: 'TIN-PROOF',
      logoUrl: null,
    },
    colors: {
      primary: '#2563eb',
      secondary: '#10b981',
      text: '#1f2937',
      muted: '#6b7280',
      border: '#e5e7eb',
      bgSubtle: '#f9fafb',
      success: '#10b981',
      danger: '#ef4444',
      warning: '#f59e0b',
    },
    fonts: {
      family: 'Helvetica',
      familyBold: 'Helvetica-Bold',
      familyItalic: 'Helvetica-Oblique',
      size: { xs: 7, sm: 8, base: 9, md: 10, lg: 12, xl: 14, '2xl': 18, '3xl': 24 },
    },
    spacing: { xs: 2, sm: 4, md: 8, lg: 12, xl: 16, '2xl': 24 },
    flags: {
      showLogo: true,
      showTaxBreakdown: true,
      showPaymentInstructions: false,
      showPricesOnDeliveryNote: false,
    },
    copy: {
      paymentInstructions: null,
      termsAndConditions: null,
      footerText: null,
      customReceiptNote: null,
    },
    paymentAccounts: [],
  };
}

describe('renderSupplierInvoiceBody (documents SSOT)', () => {
  it('produces a complete PDF buffer via finalizeDocument', async () => {
    const buffer = new PassThrough();
    const chunks: Buffer[] = [];
    buffer.on('data', (c: Buffer) => chunks.push(c));
    const closed = new Promise<void>((resolve, reject) => {
      buffer.once('end', resolve);
      buffer.once('error', reject);
    });

    const meta: DocumentMeta = {
      title: 'SUPPLIER INVOICE',
      number: 'SINV-TEST-001',
      subtitle: 'Test Supplier Ltd',
    };
    const ctx = createDocument(meta, testTheme(), buffer, { paperSize: 'A4' });

    const body: SupplierInvoiceBodyData = {
      invoice: {
        invoiceNumber: 'SINV-TEST-001',
        supplierInvoiceNumber: 'SUP-REF-99',
        invoiceDate: '2026-07-01',
        dueDate: '2026-08-01',
        status: 'Unpaid',
        subtotal: 1000,
        taxAmount: 0,
        totalAmount: 1000,
        amountPaid: 0,
        outstandingBalance: 1000,
        notes: null,
      },
      supplier: {
        name: 'Test Supplier Ltd',
        contactName: 'Jane',
        email: 'jane@test.com',
        phone: '+256700000000',
        address: 'Kampala',
      },
      lineItems: [
        {
          lineNumber: 1,
          productName: 'Widget',
          quantity: 2,
          unitOfMeasure: 'PCS',
          unitCost: 500,
          lineTotal: 1000,
        },
      ],
      allocations: [],
    };

    renderSupplierInvoiceBody(ctx, body);
    finalizeDocument(ctx, meta);
    await closed;

    const pdf = Buffer.concat(chunks);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
