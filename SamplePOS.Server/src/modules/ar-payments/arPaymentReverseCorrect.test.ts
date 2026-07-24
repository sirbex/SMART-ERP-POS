import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

/**
 * Contract / gate tests for AR reverse + correct-method (supplier parity).
 * Heavy DB paths are covered by service integration elsewhere; here we assert
 * route wiring + exported service surface match the supplier pattern.
 */
describe('AR customer payment reverse/correct parity', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('exports reverseCustomerPayment and correctCustomerPaymentMethod', async () => {
    const svc = await import('./arPaymentService.js');
    expect(typeof svc.reverseCustomerPayment).toBe('function');
    expect(typeof svc.correctCustomerPaymentMethod).toBe('function');
  });

  it('routes register reverse and correct-method handlers', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'src/modules/ar-payments/arPaymentRoutes.ts');
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toMatch(/\/:paymentId\/reverse/);
    expect(src).toMatch(/\/:paymentId\/correct-method/);
    expect(src).toMatch(/corrections\.execute/);
    expect(src).toMatch(/reverseCustomerPayment/);
    expect(src).toMatch(/correctCustomerPaymentMethod/);
  });

  it('reverseCustomerPayment rejects short reason without DB', async () => {
    const { reverseCustomerPayment } = await import('./arPaymentService.js');
    const pool = { query: jest.fn() } as unknown as Pool;
    await expect(
      reverseCustomerPayment(pool, '00000000-0000-0000-0000-000000000099', 'user', 'x'),
    ).rejects.toThrow(/min 5/i);
  });

  it('correctCustomerPaymentMethod rejects empty method without DB', async () => {
    const { correctCustomerPaymentMethod } = await import('./arPaymentService.js');
    const pool = { query: jest.fn() } as unknown as Pool;
    await expect(
      correctCustomerPaymentMethod(
        pool,
        '00000000-0000-0000-0000-000000000099',
        { newPaymentMethod: '', reason: 'fix method oops' },
        'user',
      ),
    ).rejects.toThrow(/newPaymentMethod/i);
  });

  it('reverse UPDATE keeps alloc_bounds: unallocated = total when REVERSED', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'src/modules/ar-payments/arPaymentService.ts');
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toMatch(/unallocated_amount = total_amount/);
    expect(src).not.toMatch(
      /SET status = 'REVERSED',\s*allocated_amount = 0,\s*unallocated_amount = 0/,
    );
  });
});
