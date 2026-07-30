/**
 * PROOF + regression: prefixed document numbers (sale / order / refund).
 *
 * Live failure (henber): POST /orders/:id/complete → 409 ERR_DUPLICATE
 *   duplicate key "sales_sale_number_key" (pg 23505)
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allocateNextPrefixedDocumentNumber,
  extractNumericSuffix,
  lexNextBrokenDocumentNumber,
  nextPrefixedDocumentNumber,
} from '../../utils/documentNumberAllocation.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');

function readRepo(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('document number allocation — digits-only + numeric MAX', () => {
  const salePrefix = 'SALE-2026-';
  const ordPrefix = 'ORD-2026-';
  const refPrefix = 'REF-2026-';

  it('ignores malformed / non-digit suffixes', () => {
    expect(extractNumericSuffix('SALE-2026-TEST', salePrefix)).toBeNull();
    expect(extractNumericSuffix('SALE-2026-0045A', salePrefix)).toBeNull();
    expect(extractNumericSuffix('SALE-2026-', salePrefix)).toBeNull();
    expect(extractNumericSuffix('ORD-2026-12', salePrefix)).toBeNull(); // wrong prefix
    expect(extractNumericSuffix('SALE-2026-0045', salePrefix)).toBe(45);
    expect(extractNumericSuffix('SALE-2026-10000', salePrefix)).toBe(10000);

    const next = nextPrefixedDocumentNumber(
      ['SALE-2026-TEST', 'SALE-2026-0045', 'SALE-2026-PHASE5', 'SALE-2025-9999'],
      salePrefix,
    );
    expect(next).toBe('SALE-2026-0046'); // ignores TEST/PHASE5 and other-year
  });

  it('regression: 999 → 1000 (pad expands correctly)', () => {
    expect(nextPrefixedDocumentNumber(['SALE-2026-0999'], salePrefix)).toBe('SALE-2026-1000');
    expect(nextPrefixedDocumentNumber(['SALE-2026-999'], salePrefix)).toBe('SALE-2026-1000');
  });

  it('regression: 9999 → 10000 (past 4-digit cliff)', () => {
    expect(nextPrefixedDocumentNumber(['SALE-2026-9999'], salePrefix)).toBe('SALE-2026-10000');
    expect(nextPrefixedDocumentNumber(['SALE-2026-9999', 'SALE-2026-10000'], salePrefix)).toBe(
      'SALE-2026-10001',
    );
  });

  it('regression: mixed historical widths + collision trap of lex DESC', () => {
    const mixed = ['SALE-2026-1000', 'SALE-2026-4872', 'SALE-2026-999', 'SALE-2026-0045'];
    expect('SALE-2026-999' > 'SALE-2026-4872').toBe(true);
    expect(lexNextBrokenDocumentNumber(mixed, salePrefix)).toBe('SALE-2026-1000'); // collide
    expect(nextPrefixedDocumentNumber(mixed, salePrefix)).toBe('SALE-2026-4873');
  });

  it('works for every supported prefix (sale / order / refund)', () => {
    expect(nextPrefixedDocumentNumber(['ORD-2026-0012', 'ORD-2026-9'], ordPrefix)).toBe(
      'ORD-2026-0013',
    );
    expect(nextPrefixedDocumentNumber(['REF-2026-9999'], refPrefix)).toBe('REF-2026-10000');
    expect(nextPrefixedDocumentNumber([], salePrefix)).toBe('SALE-2026-0001');
  });

  it('concurrent allocations under a shared lock produce unique monotonic numbers', async () => {
    // Simulate advisory xact lock: only one allocator mutates the shared set at a time.
    const existing = ['SALE-2026-0500', 'SALE-2026-0501'];
    let lock: Promise<void> = Promise.resolve();
    const withLock = async <T>(fn: () => T | Promise<T>): Promise<T> => {
      const prev = lock;
      let release!: () => void;
      lock = new Promise<void>((r) => {
        release = r;
      });
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    };

    const allocated = await Promise.all(
      Array.from({ length: 20 }, () =>
        withLock(() => {
          const next = nextPrefixedDocumentNumber(existing, salePrefix);
          existing.push(next);
          return next;
        }),
      ),
    );

    expect(new Set(allocated).size).toBe(20);
    expect(allocated).toEqual(
      Array.from({ length: 20 }, (_, i) => `SALE-2026-${String(502 + i).padStart(4, '0')}`),
    );

    // Same race without a lock using lex allocator → duplicates (documents the hazard).
    const raceSet = ['SALE-2026-999', 'SALE-2026-1000'];
    const raced = await Promise.all(
      Array.from({ length: 8 }, async () => {
        await Promise.resolve();
        return lexNextBrokenDocumentNumber(raceSet, salePrefix);
      }),
    );
    expect(new Set(raced).size).toBe(1);
    expect(raced[0]).toBe('SALE-2026-1000'); // collides with existing
    expect(raceSet).toContain(raced[0]);
  });
});

describe('document number SSOT wiring', () => {
  it('EVIDENCE gate: sale / order / refund call allocateNextPrefixedDocumentNumber', () => {
    const util = readRepo('SamplePOS.Server/src/utils/documentNumberAllocation.ts');
    expect(util).toContain('allocateNextPrefixedDocumentNumber');
    expect(util).toContain("~ '^[0-9]+$'");
    expect(util).toContain('DOCUMENT_NUMBER_TARGETS');
    expect(util).not.toMatch(/ORDER BY \w+ DESC/);

    const sales = readRepo('SamplePOS.Server/src/modules/sales/salesRepository.ts');
    expect(sales).toContain('allocateNextPrefixedDocumentNumber');
    expect(sales).toMatch(/kind:\s*'sale'/);
    expect(sales).toMatch(/kind:\s*'refund'/);
    expect(sales).toContain('SAVEPOINT sp_sale_number_insert');
    expect(sales).toContain('ERR_SALE_NUMBER_CONFLICT');
    // No leftover lex allocator in generateSaleNumber
    const saleGen = sales.slice(
      sales.indexOf('async generateSaleNumber'),
      sales.indexOf('async createSale'),
    );
    expect(saleGen).not.toMatch(/ORDER BY sale_number DESC/);
    expect(saleGen).toContain("allocateNextPrefixedDocumentNumber");

    const orders = readRepo('SamplePOS.Server/src/modules/orders/ordersRepository.ts');
    expect(orders).toContain('allocateNextPrefixedDocumentNumber');
    expect(orders).toMatch(/kind:\s*'order'/);
    const ordGen = orders.slice(
      orders.indexOf('async generateOrderNumber'),
      orders.indexOf('async createOrder'),
    );
    expect(ordGen).not.toMatch(/ORDER BY order_number DESC/);
  });

  it('allocator rejects unknown kinds and dangerous prefixes', async () => {
    const fakeClient = {
      query: async () => ({ rows: [{ next_num: 1 }] }),
    };
    await expect(
      allocateNextPrefixedDocumentNumber(fakeClient as never, {
        kind: 'sale',
        prefix: "SALE-2026-'; DROP",
      }),
    ).rejects.toThrow(/Invalid document number prefix/);
  });
});
