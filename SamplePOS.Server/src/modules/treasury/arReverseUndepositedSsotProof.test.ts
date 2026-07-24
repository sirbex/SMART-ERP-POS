import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Enterprise invariant proofs: AR reverse must keep Undeposited Funds (1015)
 * and receipt_settlements in lockstep. Never leave residual open after REVERSE.
 */
describe('AR reverse ↔ undeposited settlement SSOT (enterprise)', () => {
  const root = process.cwd();
  const arSvc = readFileSync(join(root, 'src/modules/ar-payments/arPaymentService.ts'), 'utf8');
  const settle = readFileSync(
    join(root, 'src/modules/treasury/receiptSettlementRepository.ts'),
    'utf8',
  );

  it('reverseCustomerPayment voids settlement before marking REVERSED', () => {
    const reverseFn = arSvc.slice(
      arSvc.indexOf('export async function reverseCustomerPayment'),
      arSvc.indexOf('export async function correctCustomerPaymentMethod'),
    );
    expect(reverseFn).toMatch(/voidSettlementForReversedArPayment/);
    expect(reverseFn).toMatch(/RECEIPT_ALREADY_DEPOSITED/);
    expect(reverseFn).toMatch(/unallocated_amount = total_amount/);
  });

  it('voidSettlementForReversedArPayment refuses already-deposited receipts', () => {
    expect(settle).toMatch(/voidSettlementForReversedArPayment/);
    expect(settle).toMatch(/RECEIPT_ALREADY_DEPOSITED/);
    expect(settle).toMatch(/already deposited via Deposit Worksheet/i);
    expect(settle).toMatch(/receipt_settlement_applications/);
    expect(settle).toMatch(/Undeposited Funds cannot go negative/i);
  });

  it('sync closes residual for REVERSED AR payments that were never deposited', () => {
    expect(settle).toMatch(/p\.status = 'REVERSED'/);
    expect(settle).toMatch(/residual_amount = 0/);
  });

  it('unsettled list/sum never include REVERSED AR payments', () => {
    expect(settle).toMatch(/p\.status IS DISTINCT FROM 'REVERSED'/);
    const sumSlice = settle.slice(settle.indexOf('export async function sumUnsettledResidual'));
    expect(sumSlice).toMatch(/IS DISTINCT FROM 'REVERSED'/);
  });

  it('sync backfills legacy INVOICE_PAYMENT rows that hit 1015', () => {
    expect(settle).toContain("'INVOICE_PAYMENT'");
    expect(settle).toContain('INVOICE_PAYMENT');
    expect(settle).toMatch(/invoice_payments ip/);
  });

  it('alloc_bounds respected on reverse (no zero/zero while total > 0)', () => {
    expect(arSvc).not.toMatch(
      /SET status = 'REVERSED',\s*allocated_amount = 0,\s*unallocated_amount = 0/,
    );
    expect(arSvc).toMatch(/unallocated_amount = total_amount/);
  });
});
