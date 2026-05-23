import { describe, it, expect } from '@jest/globals';
import Decimal from 'decimal.js';
import {
  buildFifoAllocations,
  validateAllocationLines,
} from './openItemAllocationEngine.js';

describe('openItemAllocationEngine', () => {
  it('buildFifoAllocations oldest-first partial', () => {
    const lines = buildFifoAllocations(
      [
        {
          id: 'a',
          invoiceNumber: 'INV-1',
          issueDate: '2026-01-01',
          dueDate: '2026-01-10',
          totalAmount: 100,
          amountDue: 100,
          status: 'UNPAID',
          documentType: 'INVOICE',
        },
        {
          id: 'b',
          invoiceNumber: 'INV-2',
          issueDate: '2026-01-02',
          dueDate: '2026-01-20',
          totalAmount: 50,
          amountDue: 50,
          status: 'UNPAID',
          documentType: 'INVOICE',
        },
      ],
      new Decimal(120),
    );
    expect(lines).toEqual([
      { invoiceId: 'a', amount: 100 },
      { invoiceId: 'b', amount: 20 },
    ]);
  });

  it('blocks allocation exceeding invoice open', () => {
    expect(() =>
      validateAllocationLines({
        paymentUnallocated: new Decimal(100),
        lines: [{ invoiceId: 'inv1', amount: 80 }],
        invoiceOpenById: new Map([['inv1', new Decimal(50)]]),
        invoiceCustomerById: new Map([['inv1', 'c1']]),
        invoiceStatusById: new Map([['inv1', 'UNPAID']]),
        customerId: 'c1',
      }),
    ).toThrow(/exceeds invoice open/);
  });

  it('blocks cross-customer allocation', () => {
    expect(() =>
      validateAllocationLines({
        paymentUnallocated: new Decimal(100),
        lines: [{ invoiceId: 'inv1', amount: 10 }],
        invoiceOpenById: new Map([['inv1', new Decimal(100)]]),
        invoiceCustomerById: new Map([['inv1', 'c2']]),
        invoiceStatusById: new Map([['inv1', 'UNPAID']]),
        customerId: 'c1',
      }),
    ).toThrow(/different customers/);
  });
});
