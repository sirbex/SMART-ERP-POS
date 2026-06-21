/**
 * quoteConvertibilityGuard — unit tests
 *
 * Pins the POS convert-once contract: only DRAFT / SENT / ACCEPTED quotes
 * may be sold from POS. Every other status (including CONVERTED) must
 * throw BusinessError ERR_SALE_005 BEFORE any inventory or sale write.
 */
import { describe, it, expect } from '@jest/globals';
import {
  assertQuoteConvertibleForPosSale,
  POS_CONVERTIBLE_QUOTE_STATUSES,
} from './quoteConvertibilityGuard.js';
import { BusinessError } from '../../middleware/errorHandler.js';

describe('assertQuoteConvertibleForPosSale', () => {
  it.each([...POS_CONVERTIBLE_QUOTE_STATUSES])(
    'accepts %s without throwing',
    (status) => {
      expect(() => assertQuoteConvertibleForPosSale(status, 'Q-2026-0001')).not.toThrow();
    },
  );

  it.each(['CONVERTED', 'CANCELLED', 'REJECTED', 'EXPIRED'])(
    'rejects %s with ERR_SALE_005 and includes the quote identifier in the message',
    (status) => {
      let caught: unknown;
      try {
        assertQuoteConvertibleForPosSale(status, 'Q-2026-0007');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BusinessError);
      const err = caught as BusinessError & {
        errorCode: string;
        details?: Record<string, unknown>;
      };
      expect(err.errorCode).toBe('ERR_SALE_005');
      expect(err.message).toContain('Q-2026-0007');
      expect(err.message).toContain(status);
      // Allowed list is exposed in the error context so the API client can
      // render a helpful action without re-reading the source.
      expect(err.details?.allowedStatuses).toEqual([...POS_CONVERTIBLE_QUOTE_STATUSES]);
      expect(err.details?.currentStatus).toBe(status);
    },
  );

  it('treats unknown statuses as terminal (defence in depth)', () => {
    expect(() => assertQuoteConvertibleForPosSale('PENDING_REVIEW', 'q-9'))
      .toThrow(BusinessError);
  });

  it('falls back to the raw identifier when no quote number is known', () => {
    expect(() => assertQuoteConvertibleForPosSale('CONVERTED', 'q-uuid-only'))
      .toThrow(/q-uuid-only/);
  });
});
