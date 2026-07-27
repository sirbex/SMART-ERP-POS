/**
 * EVIDENCE: Samba-style order tags format for kitchen consistency.
 */
import { describe, expect, it } from 'vitest';
import {
  formatOrderTagLabel,
  formatOrderTagsAsLineNotes,
  sumOrderTagPrices,
  toggleOrderTagSelection,
} from '@shared/utils/restaurantOrderTags';

describe('Restaurant order tags (behavioral proof)', () => {
  it('EVIDENCE prefixes format NO Salt / EXTRA Lemon / Very hot', () => {
    expect(formatOrderTagLabel({ label: 'Salt', prefix: 'NO' })).toBe('NO Salt');
    expect(formatOrderTagLabel({ label: 'Lemon', prefix: 'WITH' })).toBe('WITH Lemon');
    expect(formatOrderTagLabel({ label: 'Very hot' })).toBe('Very hot');
  });

  it('EVIDENCE soda tags denormalize into KOT line_notes', () => {
    const notes = formatOrderTagsAsLineNotes(
      [
        { label: 'Very hot' },
        { label: 'ice', prefix: 'WITH' },
        { label: 'Salt', prefix: 'NO' },
      ],
      'allergy sesame',
    );
    expect(notes).toBe('Very hot · WITH ice · NO Salt · allergy sesame');
  });

  it('EVIDENCE tag toggle respects maxSelect=1 cook heat', () => {
    const mild = { id: '1', label: 'Mild' };
    const hot = { id: '2', label: 'Very hot' };
    const one = toggleOrderTagSelection([], mild, { maxSelect: 1 });
    const two = toggleOrderTagSelection(one, hot, { maxSelect: 1 });
    expect(two).toEqual([hot]);
  });

  it('EVIDENCE priced tags sum for line surcharge', () => {
    expect(
      sumOrderTagPrices([
        { label: 'Extra cheese', price: 2 },
        { label: 'No onion', price: 0 },
      ]),
    ).toBe(2);
  });
});
