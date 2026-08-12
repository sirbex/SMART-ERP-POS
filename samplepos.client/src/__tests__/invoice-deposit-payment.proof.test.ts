/**
 * Client proof: Receive Payment deposit method uses SSOT and fail-loud fetch.
 * Run: npx vitest run src/__tests__/invoice-deposit-payment.proof.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  allocateDepositFifo,
  assertDepositPaymentAmount,
  depositPaymentCap,
  money2,
} from '../../../shared/domain/invoiceDepositPayment';

const repoRoot = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('invoice deposit payment client proof', () => {
  it('SSOT math matches Receive Payment INV outstanding 303200', () => {
    expect(depositPaymentCap(303200, 100000).toFixed(2)).toBe('100000.00');
    expect(depositPaymentCap(303200, 500000).toFixed(2)).toBe('303200.00');
    const pay = assertDepositPaymentAmount({
      amount: '303200.00',
      outstanding: 303200,
      depositAvailable: 303200,
    });
    expect(pay.eq(money2(303200))).toBe(true);
    const fifo = allocateDepositFifo(
      [
        { id: 'd1', available: '200000' },
        { id: 'd2', available: '200000' },
      ],
      303200,
    );
    expect(fifo.totalApplied.toFixed(2)).toBe('303200.00');
    expect(fifo.allocations[0].amount.toFixed(2)).toBe('200000.00');
    expect(fifo.allocations[1].amount.toFixed(2)).toBe('103200.00');
  });

  it('modal + page + hook are fail-loud', () => {
    const modal = read('samplepos.client/src/components/customers/CustomerDetailModal.tsx');
    const page = read('samplepos.client/src/pages/customers/CustomerDetailPage.tsx');
    const hook = read('samplepos.client/src/hooks/useInvoiceDepositBalance.ts');
    expect(hook).toContain("setStatus('error')");
    expect(hook).not.toMatch(/setAvailable\(new Decimal\(0\)\)[\s\S]{0,80}catch/);
    expect(modal).toContain('value="DEPOSIT"');
    expect(modal).toContain('assertDepositPaymentAmount');
    expect(modal).toContain('useInvoiceDepositBalance');
    expect(page).toContain('value="DEPOSIT"');
    expect(page).toContain('assertDepositPaymentAmount');
    expect(page).not.toContain('setCustomerDepositBalance(0)');
  });
});
