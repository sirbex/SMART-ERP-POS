/**
 * PROOF: Sale refund GL posts two journals with distinct ReferenceType
 * (SALE_REFUND + SALE_REFUND_COGS) so UNIQUE(ReferenceType, ReferenceId) is satisfied.
 *
 * Incident: Bliss REF-2026-0005 / sale 77ab2a5f — ERR_CONSTRAINT uq_ledger_transactions_reference
 * when revenue + inventory both used SALE_REFUND for the same refundId.
 *
 * npm test -- --runInBand src/services/saleRefundGlReferenceSsot.evidence.test.ts
 */
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JournalEntryRequest } from './accountingCore.js';

type MockFn = (...args: unknown[]) => Promise<unknown>;

let capturedEntries: JournalEntryRequest[] = [];
const createJournalEntryMock = jest.fn<MockFn>(async (request: unknown) => {
  capturedEntries.push(request as JournalEntryRequest);
  return {
    transactionId: `txn-${capturedEntries.length}`,
    transactionNumber: `TXN-${capturedEntries.length}`,
    status: 'POSTED',
    totalDebits: 0,
    totalCredits: 0,
  };
});

jest.unstable_mockModule('./accountingCore.js', () => ({
  AccountingCore: {
    createJournalEntry: createJournalEntryMock,
    reverseTransaction: jest.fn<MockFn>(),
  },
  AccountingError: class extends Error {
    constructor(msg: string, public readonly code: string) {
      super(msg);
      this.name = 'AccountingError';
    }
  },
}));

jest.unstable_mockModule('../db/pool.js', () => {
  const query = jest.fn<MockFn>(async () => ({ rows: [{ Id: 'sale-gl' }], rowCount: 1 }));
  return {
    pool: {
      query,
      connect: jest.fn<MockFn>(async () => ({ query, release: jest.fn() })),
    },
    default: { query },
  };
});

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: {
    info: jest.fn<MockFn>(),
    error: jest.fn<MockFn>(),
    warn: jest.fn<MockFn>(),
    debug: jest.fn<MockFn>(),
  },
}));

jest.unstable_mockModule('../utils/constants.js', () => ({
  SYSTEM_USER_ID: 'system-user',
}));

const { recordSaleRefundToGL } = await import('./glEntryService.js');

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

describe('PROOF: SALE_REFUND / SALE_REFUND_COGS reference SSOT', () => {
  beforeEach(() => {
    capturedEntries = [];
    createJournalEntryMock.mockClear();
  });

  it('posts revenue as SALE_REFUND and inventory as SALE_REFUND_COGS (same refundId)', async () => {
    await recordSaleRefundToGL({
      refundId: '77ab2a5f-refund-proof',
      refundNumber: 'REF-2026-0005',
      saleId: '77ab2a5f-6c20-46a0-afff-33c52ff56bb3',
      saleNumber: 'SALE-2026-0001',
      refundDate: '2026-09-04',
      reason: 'Customer return',
      totalAmount: 185000,
      totalCost: 50000,
      paymentMethod: 'CASH',
    });

    expect(capturedEntries).toHaveLength(2);
    const types = capturedEntries.map((e) => e.referenceType).sort();
    expect(types).toEqual(['SALE_REFUND', 'SALE_REFUND_COGS']);
    expect(capturedEntries.every((e) => e.referenceId === '77ab2a5f-refund-proof')).toBe(true);
    expect(new Set(capturedEntries.map((e) => e.referenceType)).size).toBe(2);

    gate(
      'DUAL_REF_TYPES',
      types[0] === 'SALE_REFUND' && types[1] === 'SALE_REFUND_COGS',
      'revenue + inventory journals use distinct ReferenceType',
    );
    gate(
      'SAME_REFUND_ID',
      capturedEntries.every((e) => e.referenceId === '77ab2a5f-refund-proof'),
      'both journals share refundId (allowed once ReferenceType differs)',
    );
  });

  it('source code documents SALE/SALE_COGS mirror and no dual SALE_REFUND', () => {
    const src = readFileSync(
      path.join(serverRoot, 'src/services/glEntryService.ts'),
      'utf8',
    );
    const fnStart = src.indexOf('export async function recordSaleRefundToGL');
    const fnBody = src.slice(fnStart, fnStart + 6500);
    gate(
      'INV_USES_REFUND_COGS',
      fnBody.includes("referenceType: 'SALE_REFUND_COGS'") &&
        fnBody.includes('uq_ledger_transactions_reference'),
      'inventory leg uses SALE_REFUND_COGS with unique-constraint comment',
    );
    gate(
      'NO_DUAL_SALE_REFUND',
      (fnBody.match(/referenceType:\s*'SALE_REFUND'/g) || []).length === 1,
      'exactly one SALE_REFUND journal (revenue) in recordSaleRefundToGL',
    );
    gate(
      'SALE_MIRROR',
      src.includes("referenceType: 'SALE_COGS'") &&
        src.includes('to allow both journals'),
      'original sale already uses SALE + SALE_COGS pattern',
    );
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const payload = {
    feature: 'SALE_REFUND_GL_REFERENCE_SSOT',
    verdict: passed === gates.length ? 'PASS' : 'FAIL',
    passed,
    total: gates.length,
    gates,
    incident: {
      tenant: 'bliss-interior-ltd',
      saleId: '77ab2a5f-6c20-46a0-afff-33c52ff56bb3',
      refundNumber: 'REF-2026-0005',
      error: 'duplicate key value violates unique constraint uq_ledger_transactions_reference',
      cause:
        'recordSaleRefundToGL posted revenue + inventory with same (SALE_REFUND, refundId)',
      fix: 'inventory journal referenceType = SALE_REFUND_COGS (mirrors SALE_COGS)',
    },
    generatedAt: new Date().toISOString(),
  };
  for (const root of [repoRoot, serverRoot]) {
    writeFileSync(
      path.join(root, 'PROOF_SALE_REFUND_GL_REFERENCE_SSOT.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
    );
    writeFileSync(
      path.join(root, 'PROOF_SALE_REFUND_GL_REFERENCE_SSOT.md'),
      `# PROOF_SALE_REFUND_GL_REFERENCE_SSOT\n\nVerdict: **${payload.verdict}** (${passed}/${gates.length})\n\n` +
        gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`).join('\n') +
        `\n\n## Incident\n\n- Tenant: ${payload.incident.tenant}\n- Sale: ${payload.incident.saleId}\n- Refund: ${payload.incident.refundNumber}\n- Cause: ${payload.incident.cause}\n- Fix: ${payload.incident.fix}\n`,
    );
  }
});
