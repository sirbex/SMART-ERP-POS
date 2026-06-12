import { describe, expect, it } from 'vitest';
import {
  grItemTrackExpiry,
  grLineExpiryRequired,
  grLineExpirySatisfied,
} from '../utils/grExpiryGate';

describe('grExpiryGate — product-driven expiry (Rule 1)', () => {
  it('reads trackExpiry from camelCase or snake_case', () => {
    expect(grItemTrackExpiry({ trackExpiry: true })).toBe(true);
    expect(grItemTrackExpiry({ track_expiry: true })).toBe(true);
    expect(grItemTrackExpiry({})).toBe(false);
  });

  it('does not require expiry for non-tracked products with qty', () => {
    expect(grLineExpiryRequired(false, 5)).toBe(false);
    expect(grLineExpirySatisfied(false, 5, null)).toBe(true);
    expect(grLineExpirySatisfied(false, 5, '')).toBe(true);
  });

  it('requires expiry for tracked products with qty > 0', () => {
    expect(grLineExpiryRequired(true, 1)).toBe(true);
    expect(grLineExpiryRequired(true, 0)).toBe(false);
    expect(grLineExpirySatisfied(true, 1, null)).toBe(false);
    expect(grLineExpirySatisfied(true, 1, '2030-06-01')).toBe(true);
  });
});
