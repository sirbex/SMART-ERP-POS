import { describe, expect, it } from 'vitest';
import {
  isOpenSupplierCreditNote,
  summarizeSupplierOpenItems,
} from './supplierOpenItemSummary';

/**
 * Proof: SALUD PHARMACY LIMITED production gap (2026-07-21 investigate).
 * Invoice-tab raw SUM = 18,708,689; open-item / statement / GL 2100 = 17,596,259.
 * Gap = 1,112,430 = 2 × open credit notes 556,215.
 */
const SALUD_PROOF = {
  wrongRawSum: 18_708_689,
  correctNet: 17_596_259,
  openCredits: 556_215,
  gapWrongMinusCorrect: 1_112_430,
} as const;

describe('summarizeSupplierOpenItems (SAP/Odoo/Tally open-item parity)', () => {
  it('treats credit notes as reducing payable (not adding to bills)', () => {
    const summary = summarizeSupplierOpenItems([
      { documentType: 'SUPPLIER_INVOICE', status: 'Pending', outstandingBalance: 1_000_000 },
      { documentType: 'SUPPLIER_CREDIT_NOTE', status: 'Pending', outstandingBalance: 150_000 },
    ]);
    expect(summary.billsDue).toBe(1_000_000);
    expect(summary.openCredits).toBe(150_000);
    expect(summary.openCreditCount).toBe(1);
    expect(summary.netPayable).toBe(850_000);
  });

  it('ignores paid / applied / cancelled documents', () => {
    const summary = summarizeSupplierOpenItems([
      { documentType: 'SUPPLIER_INVOICE', status: 'Pending', outstandingBalance: 500_000 },
      { documentType: 'SUPPLIER_CREDIT_NOTE', status: 'APPLIED', outstandingBalance: 200_000 },
      { documentType: 'SUPPLIER_INVOICE', status: 'Paid', outstandingBalance: 0 },
      { documentType: 'SUPPLIER_CREDIT_NOTE', status: 'Cancelled', outstandingBalance: 50_000 },
    ]);
    expect(summary.billsDue).toBe(500_000);
    expect(summary.openCredits).toBe(0);
    expect(summary.netPayable).toBe(500_000);
  });

  it('floors net payable at zero when credits exceed bills', () => {
    const summary = summarizeSupplierOpenItems([
      { documentType: 'SUPPLIER_INVOICE', status: 'Pending', outstandingBalance: 100_000 },
      { documentType: 'SUPPLIER_CREDIT_NOTE', status: 'Pending', outstandingBalance: 250_000 },
    ]);
    expect(summary.netPayable).toBe(0);
    expect(summary.openCredits).toBe(250_000);
  });

  it('SALUD production proof: raw sum − 2×CN = open-item net', () => {
    const billsDue = SALUD_PROOF.wrongRawSum - SALUD_PROOF.openCredits;
    const docs = [
      { documentType: 'SUPPLIER_INVOICE', status: 'Pending', outstandingBalance: billsDue },
      {
        documentType: 'SUPPLIER_CREDIT_NOTE',
        status: 'Pending',
        outstandingBalance: SALUD_PROOF.openCredits,
      },
    ];
    const summary = summarizeSupplierOpenItems(docs);
    expect(summary.openCredits).toBe(SALUD_PROOF.openCredits);
    expect(summary.netPayable).toBe(SALUD_PROOF.correctNet);
    expect(SALUD_PROOF.wrongRawSum - summary.netPayable).toBe(SALUD_PROOF.gapWrongMinusCorrect);
    expect(2 * summary.openCredits).toBe(SALUD_PROOF.gapWrongMinusCorrect);
  });

  it('isOpenSupplierCreditNote identifies unapplied CN rows', () => {
    expect(
      isOpenSupplierCreditNote({
        documentType: 'SUPPLIER_CREDIT_NOTE',
        status: 'Pending',
        outstandingBalance: 556_215,
      }),
    ).toBe(true);
    expect(
      isOpenSupplierCreditNote({
        documentType: 'SUPPLIER_INVOICE',
        status: 'Pending',
        outstandingBalance: 100,
      }),
    ).toBe(false);
  });
});
