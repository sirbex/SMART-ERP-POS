/**
 * PROOF: sale/order/refund/movement numbers use Postgres SEQUENCE (nextval).
 * Complete path must NOT hold advisory_xact_lock across FEFO/GL (30s timeouts).
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

describe('document number allocation — digits-only + numeric MAX (pure)', () => {
  const salePrefix = 'SALE-2026-';

  it('ignores malformed / non-digit suffixes', () => {
    expect(extractNumericSuffix('SALE-2026-TEST', salePrefix)).toBeNull();
    expect(extractNumericSuffix('SALE-2026-0045', salePrefix)).toBe(45);
    expect(
      nextPrefixedDocumentNumber(
        ['SALE-2026-TEST', 'SALE-2026-0045', 'SALE-2026-PHASE5'],
        salePrefix,
      ),
    ).toBe('SALE-2026-0046');
  });

  it('regression: 999 → 1000 and 9999 → 10000', () => {
    expect(nextPrefixedDocumentNumber(['SALE-2026-999'], salePrefix)).toBe('SALE-2026-1000');
    expect(nextPrefixedDocumentNumber(['SALE-2026-9999'], salePrefix)).toBe('SALE-2026-10000');
  });

  it('regression: mixed historical widths — lex collides, numeric does not', () => {
    const mixed = ['SALE-2026-1000', 'SALE-2026-4872', 'SALE-2026-999'];
    expect(lexNextBrokenDocumentNumber(mixed, salePrefix)).toBe('SALE-2026-1000');
    expect(nextPrefixedDocumentNumber(mixed, salePrefix)).toBe('SALE-2026-4873');
  });
});

describe('document number SEQUENCE SSOT (complete-path scale)', () => {
  it('EVIDENCE: migration 577 creates sequences and seeds setval from MAX', () => {
    const mig = readRepo('shared/sql/577_doc_number_sequences.sql');
    expect(mig).toContain('doc_sale_number_seq');
    expect(mig).toContain('doc_order_number_seq');
    expect(mig).toContain('doc_refund_number_seq');
    expect(mig).toContain('doc_movement_number_seq');
    expect(mig).toContain('setval');
  });

  it('EVIDENCE: migration 581 resyncs sequences to MAX (order-complete 409 heal)', () => {
    const mig = readRepo('shared/sql/581_resync_doc_number_sequences.sql');
    expect(mig).toContain('doc_movement_number_seq');
    expect(mig).toContain('setval');
    expect(mig).toContain('581');
    const ver = readRepo('SamplePOS.Server/src/constants/schemaVersion.ts');
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*58\d/);
  });

  it('EVIDENCE gate: allocator uses nextval + self-heal — no advisory lock on sale/order/refund', () => {
    const util = readRepo('SamplePOS.Server/src/utils/documentNumberAllocation.ts');
    expect(util).toContain('nextval(');
    expect(util).toContain('doc_sale_number_seq');
    expect(util).toContain('allocateNextMovementNumber');
    expect(util).toContain('resyncDocumentNumberSequences');
    expect(util).not.toContain('pg_advisory_xact_lock');
    expect(util).not.toMatch(/ORDER BY \w+ DESC/);

    const sales = readRepo('SamplePOS.Server/src/modules/sales/salesRepository.ts');
    expect(sales).toContain('allocateNextPrefixedDocumentNumber');
    expect(sales).toMatch(/kind:\s*'sale'/);
    expect(sales).toMatch(/kind:\s*'refund'/);

    const orders = readRepo('SamplePOS.Server/src/modules/orders/ordersRepository.ts');
    expect(orders).toContain('allocateNextPrefixedDocumentNumber');
    expect(orders).toMatch(/kind:\s*'order'/);

    const salesSvc = readRepo('SamplePOS.Server/src/modules/sales/salesService.ts');
    expect(salesSvc).toContain('allocateNextMovementNumber');
    expect(salesSvc).not.toContain("pg_advisory_xact_lock(hashtext('movement_number_seq'))");

    const movRepo = readRepo('SamplePOS.Server/src/modules/stock-movements/stockMovementRepository.ts');
    expect(movRepo).toContain('allocateNextMovementNumber');
    expect(movRepo).not.toContain("pg_advisory_xact_lock(hashtext('movement_number_seq'))");

    // Legacy MAX+1 writers must be gone — they raced the sequence → 409 on complete
    for (const rel of [
      'SamplePOS.Server/src/modules/quotations/quotationService.ts',
      'SamplePOS.Server/src/modules/goods-receipts/goodsReceiptService.ts',
      'SamplePOS.Server/src/modules/inventory/stockMovementHandler.ts',
      'SamplePOS.Server/src/modules/inventory/warehouse/warehouseSaleVoidRestoreService.ts',
      'SamplePOS.Server/src/modules/delivery-notes/deliveryNoteService.ts',
      'SamplePOS.Server/src/modules/distribution/distRepository.ts',
      'SamplePOS.Server/src/services/masterDataGuard.ts',
    ]) {
      const src = readRepo(rel);
      expect(src).not.toContain("pg_advisory_xact_lock(hashtext('movement_number_seq'))");
    }
  });

  it('allocator rejects dangerous prefixes', async () => {
    const fakeClient = { query: async () => ({ rows: [{ n: 1 }] }) };
    await expect(
      allocateNextPrefixedDocumentNumber(fakeClient as never, {
        kind: 'sale',
        prefix: "SALE-2026-'; DROP",
      }),
    ).rejects.toThrow(/Invalid document number prefix/);
  });
});
