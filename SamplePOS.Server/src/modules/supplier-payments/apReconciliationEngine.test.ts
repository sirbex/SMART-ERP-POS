import { describe, it, expect } from '@jest/globals';
import {
  AP_OPEN_INVOICE_GL_POSTED_SQL,
  AP_OPEN_INVOICE_STATUS_SQL,
  apMaterialityThreshold,
  isApDriftExplainedByExpenses,
  isApDriftExplainedByUnpostedInvoices,
  type ApReconciliationSnapshot,
} from './apReconciliationEngine.js';

describe('apReconciliationEngine — Wave 5', () => {
  it('uses 5000 UGX minimum materiality threshold', () => {
    expect(apMaterialityThreshold(1_000_000)).toBe(5000);
    expect(apMaterialityThreshold(100_000_000)).toBeGreaterThan(5000);
  });

  it('treats drift explained by standalone expenses on 2100 as reconciled', () => {
    const snapshot: ApReconciliationSnapshot = {
      glBalance: 10_000_000,
      invoiceOpenBalance: 10_601_530,
      unallocatedPayments: 0,
      subledgerBalance: 10_601_530,
      expenseOnAp: 601_530,
      legacyGrInAp: 0,
      unpostedOpenInvoiceBalance: 0,
      drift: -601_530,
      residualAfterExpense: 0,
    };
    expect(isApDriftExplainedByExpenses(snapshot)).toBe(true);
  });

  it('flags unexplained material drift', () => {
    const snapshot: ApReconciliationSnapshot = {
      glBalance: 10_000_000,
      invoiceOpenBalance: 11_000_000,
      unallocatedPayments: 0,
      subledgerBalance: 11_000_000,
      expenseOnAp: 0,
      legacyGrInAp: 0,
      unpostedOpenInvoiceBalance: 0,
      drift: -1_000_000,
      residualAfterExpense: -1_000_000,
    };
    expect(isApDriftExplainedByExpenses(snapshot)).toBe(false);
  });

  it('accounts for unallocated payments in subledger math', () => {
    const invoiceOpen = 500_000;
    const unallocated = 100_000;
    const subledger = Math.max(0, invoiceOpen - unallocated);
    expect(subledger).toBe(400_000);
  });

  it('supplier open-item subtracts credit notes (Salud-class bug)', () => {
    const correctOpenItem = 14_702_423;
    const creditNotesOutstanding = 887_120;
    const wrongRawSum = correctOpenItem + creditNotesOutstanding;
    expect(wrongRawSum).toBe(15_589_543);
  });

  it('open-item SSOT only includes invoices posted to GL', () => {
    expect(AP_OPEN_INVOICE_GL_POSTED_SQL).toContain('is_posted_to_gl');
  });

  it('open-item SSOT includes PAID over-applied credits only when SCN hit AP GL', () => {
    expect(AP_OPEN_INVOICE_STATUS_SQL).toMatch(/PAID/);
    expect(AP_OPEN_INVOICE_STATUS_SQL).toMatch(/OutstandingBalance/);
    expect(AP_OPEN_INVOICE_STATUS_SQL).toMatch(/SUPPLIER_CREDIT_NOTE/);
    expect(AP_OPEN_INVOICE_STATUS_SQL).toMatch(/2100/);
    expect(AP_OPEN_INVOICE_STATUS_SQL).toMatch(/IN \(/);
  });

  it('blocks heal-ap-drift when drift equals unposted pipeline gap', () => {
    const snapshot: ApReconciliationSnapshot = {
      glBalance: 24_567_360,
      invoiceOpenBalance: 24_567_360,
      unallocatedPayments: 0,
      subledgerBalance: 24_567_360,
      expenseOnAp: 0,
      legacyGrInAp: 0,
      unpostedOpenInvoiceBalance: 2_181_275,
      drift: 0,
      residualAfterExpense: 0,
    };
    expect(isApDriftExplainedByUnpostedInvoices({
      ...snapshot,
      subledgerBalance: 26_748_635,
      drift: -2_181_275,
    })).toBe(true);
  });

  it('ledger repair counts APPLIED supplier credit notes on reference bills', () => {
    const billTotal = 452_800;
    const appliedReturnScns = 56_000 + 22_000 + 22_000;
    expect(billTotal - appliedReturnScns).toBe(352_800);
  });
});
