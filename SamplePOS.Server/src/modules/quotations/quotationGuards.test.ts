/**
 * Unit tests for the Quotation editability/status-change guards (P4 SSOT).
 *
 * These guards are the single source of truth used by every quotation
 * mutation route (updateQuotation, updateQuotationStatus, updateItemDecisions,
 * deleteQuotation). Pinning their behaviour means a future change to one
 * route cannot drift from the canonical "what state can be mutated" rule.
 *
 * Assertions check `statusCode` (the HTTP contract) rather than constructor
 * identity, which is fragile under ESM/ts-jest dual-module resolution.
 */
import { describe, it, expect } from '@jest/globals';
import {
  assertEditableQuotation,
  assertStatusChangeable,
  TERMINAL_QUOTATION_STATUSES,
  type QuotationGuardShape,
} from './quotationGuards.js';

const base = (overrides: Partial<QuotationGuardShape> = {}): QuotationGuardShape => ({
  status: 'DRAFT',
  quote_number: 'Q-2026-9999',
  converted_to_sale_id: null,
  converted_to_so_id: null,
  converted_to_dn_id: null,
  ...overrides,
});

const expectConflict = (fn: () => unknown, messageRegex?: RegExp): void => {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  const e = caught as { statusCode?: number; message?: string };
  expect(e.statusCode).toBe(409);
  if (messageRegex) {
    expect(e.message).toMatch(messageRegex);
  }
};

describe('assertEditableQuotation', () => {
  it('permits DRAFT, SENT, and ACCEPTED', () => {
    for (const status of ['DRAFT', 'SENT', 'ACCEPTED'] as const) {
      expect(() => assertEditableQuotation(base({ status }))).not.toThrow();
    }
  });

  it.each([...TERMINAL_QUOTATION_STATUSES])(
    'rejects terminal status %s as 409',
    (status) => {
      expectConflict(() => assertEditableQuotation(base({ status })), new RegExp(status));
    },
  );

  it('rejects when converted_to_sale_id is set (retail claim)', () => {
    expectConflict(
      () => assertEditableQuotation(base({ status: 'DRAFT', converted_to_sale_id: 'sale-uuid' })),
      /converted to sale sale-uuid/,
    );
  });

  it('rejects when converted_to_so_id is set (wholesale claim)', () => {
    expectConflict(
      () => assertEditableQuotation(base({ status: 'DRAFT', converted_to_so_id: 'so-uuid' })),
      /distribution sales order so-uuid/,
    );
  });

  it('rejects when converted_to_dn_id is set (delivery note claim)', () => {
    expectConflict(
      () => assertEditableQuotation(base({ status: 'DRAFT', converted_to_dn_id: 'dn-uuid' })),
      /delivery note dn-uuid/,
    );
  });

  it('FK check fires BEFORE status check (so the error names the downstream document)', () => {
    expectConflict(
      () => assertEditableQuotation(base({ status: 'DRAFT', converted_to_sale_id: 'sale-7' })),
      /converted to sale sale-7/,
    );
  });
});

describe('assertStatusChangeable', () => {
  it('permits any non-CONVERTED target on an unclaimed, non-terminal quote', () => {
    for (const target of ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
      expect(() => assertStatusChangeable(base({ status: 'SENT' }), target)).not.toThrow();
    }
  });

  it('rejects manual CONVERTED writes (must go through convert endpoint)', () => {
    expectConflict(
      () => assertStatusChangeable(base({ status: 'ACCEPTED' }), 'CONVERTED'),
      /use the convert endpoint/i,
    );
  });

  it('rejects status changes on a CONVERTED quote', () => {
    expectConflict(
      () => assertStatusChangeable(base({ status: 'CONVERTED' }), 'CANCELLED'),
      /CONVERTED/,
    );
  });

  it('rejects status changes when a retail FK is claimed', () => {
    expectConflict(
      () => assertStatusChangeable(base({ status: 'ACCEPTED', converted_to_sale_id: 'sale-9' }), 'CANCELLED'),
      /converted to sale sale-9/,
    );
  });

  it('rejects status changes when a wholesale FK is claimed', () => {
    expectConflict(
      () => assertStatusChangeable(base({ status: 'ACCEPTED', converted_to_so_id: 'so-9' }), 'CANCELLED'),
      /distribution sales order so-9/,
    );
  });
});

describe('TERMINAL_QUOTATION_STATUSES snapshot', () => {
  it('matches the closed-quotation SSOT', () => {
    // Snapshot guard: if a new terminal status is added we must intentionally
    // update both this list and CLOSED_QUOTATION_STATUSES in shared/zod.
    expect([...TERMINAL_QUOTATION_STATUSES].sort()).toEqual(
      ['CANCELLED', 'CONVERTED', 'EXPIRED', 'REJECTED'].sort(),
    );
  });
});
