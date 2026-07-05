/**
 * Phase 1 — GR poAlreadyReceived parity: finalize and item-edit paths share net-received SQL.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'goodsReceiptRepository.ts',
);
const source = readFileSync(repoPath, 'utf8');

function fnBody(fnName: string): string {
  const start = source.indexOf(`async ${fnName}(`);
  if (start < 0) throw new Error(`Function ${fnName} not found`);
  const nextFn = source.indexOf('\n  async ', start + 1);
  return nextFn > start ? source.slice(start, nextFn) : source.slice(start);
}

describe('goodsReceiptRepository poAlreadyReceived parity (Phase 1)', () => {
  it('getGRById and getGRItemWithParent both use poItemNetReceivedQuantitySql', () => {
    const getById = fnBody('getGRById');
    const getItem = fnBody('getGRItemWithParent');
    for (const body of [getById, getItem]) {
      expect(body).toContain('poItemNetReceivedQuantitySql');
      expect(body).toContain('poItemReturnedQuantitySql');
      expect(body).toContain('as "poAlreadyReceived"');
    }
  });

  it('neither path aliases gross received_quantity as poAlreadyReceived', () => {
    const getById = fnBody('getGRById');
    const getItem = fnBody('getGRItemWithParent');
    for (const body of [getById, getItem]) {
      expect(body).not.toContain('COALESCE(poi.received_quantity, 0) as "poAlreadyReceived"');
    }
  });
});
