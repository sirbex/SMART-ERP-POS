/**
 * Void-last-lines then add: never toast "Check is not open".
 */
import { describe, expect, it } from 'vitest';
import {
  openOrderIdsFromDetails,
  resolveClosedCheckAddRetry,
} from './restaurantClosedCheckAdd';

const CLOSED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPEN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OPEN_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('resolveClosedCheckAddRetry', () => {
  it('void last items, no other tickets → open a new check', () => {
    expect(resolveClosedCheckAddRetry(CLOSED, [])).toEqual({ action: 'open-new' });
    expect(resolveClosedCheckAddRetry(CLOSED, [CLOSED])).toEqual({ action: 'open-new' });
    expect(resolveClosedCheckAddRetry(CLOSED, null)).toEqual({ action: 'open-new' });
  });

  it('void last items while one sibling remains → bind that ticket', () => {
    expect(resolveClosedCheckAddRetry(CLOSED, [CLOSED, OPEN_B])).toEqual({
      action: 'bind',
      orderId: OPEN_B,
    });
    expect(resolveClosedCheckAddRetry(CLOSED, [OPEN_B])).toEqual({
      action: 'bind',
      orderId: OPEN_B,
    });
  });

  it('two remaining tickets → party list, not Invalid request', () => {
    const r = resolveClosedCheckAddRetry(CLOSED, [OPEN_B, OPEN_C]);
    expect(r).toEqual({ action: 'select-ticket', openOrderIds: [OPEN_B, OPEN_C] });
  });

  it('openOrderIdsFromDetails reads BusinessError details only', () => {
    expect(openOrderIdsFromDetails({ openOrderIds: [OPEN_B] })).toEqual([OPEN_B]);
    expect(openOrderIdsFromDetails({ openOrderIds: ['', OPEN_B, 1] })).toEqual([OPEN_B]);
    expect(openOrderIdsFromDetails({})).toEqual([]);
    expect(openOrderIdsFromDetails(undefined)).toEqual([]);
  });
});
