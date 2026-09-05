/**
 * Adaptive PWA Platform — Phase 4 evidence
 * Floorplan wave 1: Sales + Distribution Invoices + POS scanner/print.
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md roadmap Phase 4
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(here, rel), 'utf8');
}

describe('Phase 4 floorplan wave 1 — Sales', () => {
  it('SalesPage uses AdaptivePage / Toolbar / Search — keeps sales hooks', () => {
    const src = read('../pages/SalesPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('useSales');
    expect(src).toContain('from \'../hooks/useApi\'');
    expect(src).toContain('printReceipt');
    expect(src).not.toMatch(/\/api\/mobile/);
    // Search still bound to existing state (same command path)
    expect(src).toContain('value={searchQuery}');
    expect(src).toContain('onChange={setSearchQuery}');
    // Ops expense path — replace Export Report
    expect(src).not.toContain('Export Report');
    expect(src).toContain('data-sales-expense-cta="true"');
    expect(src).toContain('CreateExpenseForm');
    expect(src).toContain("['expenses.create']");
  });
});

describe('Phase 4 floorplan wave 1 — Invoices', () => {
  it('DistInvoiceListPage uses AdaptivePage / Toolbar / DataGrid — same distributionApi', () => {
    const src = read('../pages/distribution/DistInvoiceListPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('AdaptiveDataGrid');
    expect(src).toContain('distributionApi.listInvoices');
    expect(src).toContain('queryKey: [\'dist-invoices\'');
    expect(src).not.toMatch(/\/api\/mobile/);
  });
});

describe('Phase 4 floorplan wave 1 — POS', () => {
  it('POSPage uses AdaptiveScanner with same barcode handler — no direct useBarcodeScanner', () => {
    const src = read('../pages/pos/POSPage.tsx');
    expect(src).toContain('AdaptiveScanner');
    expect(src).toContain('onScan={handleBarcodeScanned}');
    expect(src).toContain('data-pos-adaptive-scanner');
    expect(src).not.toMatch(/useBarcodeScanner\s*\(/);
    expect(src).not.toMatch(/from ['"].*useBarcodeScanner['"]/);
    // Sale / reprint APIs unchanged
    expect(src).toContain('useCreatePOSSale');
    expect(src).toContain('/sales/');
  });

  it('PrintReceiptDialog uses AdaptiveDialog + printReceipt SSOT', () => {
    const src = read('../components/pos/PrintReceiptDialog.tsx');
    expect(src).toContain('AdaptiveDialog');
    expect(src).toContain('printReceipt');
    expect(src).toContain('data-adaptive-print-receipt');
    expect(src).toContain('data-receipt-preview');
    expect(src).not.toMatch(/from ['"]@\/components\/ui\/dialog['"]/);
    expect(src).not.toMatch(/fetch\(['"]http:\/\/localhost:1811/);
  });
});
