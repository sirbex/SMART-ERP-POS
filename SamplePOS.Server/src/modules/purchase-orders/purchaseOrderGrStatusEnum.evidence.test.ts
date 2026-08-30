/**
 * Regression: never bind invalid goods_receipt_status enum labels (PG 22P02).
 * Enum SSOT: DRAFT | COMPLETED | CANCELLED (shared/sql/001_initial_schema.sql).
 *
 * npm test -- --runInBand src/modules/purchase-orders/purchaseOrderGrStatusEnum.evidence.test.ts
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

describe('PO update vs goods_receipt_status enum', () => {
  it('getPOSupplierChangeBlocker does not use FINALIZED (invalid enum label)', () => {
    const src = readFileSync(path.join(dir, 'purchaseOrderRepository.ts'), 'utf8');
    // The blocking query must only use valid enum values
    expect(src).toMatch(/status\s*=\s*'COMPLETED'/);
    expect(src).not.toMatch(/status\s+IN\s*\([^)]*FINALIZED/);
    // Avoid future regressions: no FINALIZED cast into goods_receipts status filters
    const blockerSlice = src.slice(
      src.indexOf('getPOSupplierChangeBlocker'),
      src.indexOf('updatePOHeader'),
    );
    expect(blockerSlice).toContain("status = 'COMPLETED'");
    expect(blockerSlice).not.toMatch(/status\s+IN\s*\(\s*'COMPLETED'\s*,\s*'FINALIZED'\s*\)/);
    expect(blockerSlice).not.toMatch(/status\s*=\s*'FINALIZED'/);
  });

  it('schema enum does not include FINALIZED', () => {
    const schema = readFileSync(
      path.resolve(dir, '../../../../shared/sql/001_initial_schema.sql'),
      'utf8',
    );
    expect(schema).toMatch(
      /CREATE TYPE goods_receipt_status AS ENUM \('DRAFT', 'COMPLETED', 'CANCELLED'\)/,
    );
    expect(schema).not.toMatch(/goods_receipt_status AS ENUM \([^)]*FINALIZED/);
  });
});
