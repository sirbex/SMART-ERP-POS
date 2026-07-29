import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('restaurant customer search (FOH primary)', () => {
  it('keeps takeaway/delivery CustomerSelector on the ticket canvas (not sheet-only)', () => {
    const page = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(page).toContain("import CustomerSelector from '../../components/pos/CustomerSelector'");
    expect(page).toContain('data-restaurant-customer="primary"');
    // Must not demote customer search behind secondaryActions sheet gating.
    expect(page).not.toMatch(
      /serviceChannel\s*&&\s*chrome\.secondaryActions\s*===\s*'inline'\s*\?\s*\([\s\S]*CustomerSelector/,
    );
  });

  it('renders compact customer results in-flow so overflow parents cannot clip them', () => {
    const selector = readFileSync(
      resolve(here, '../components/pos/CustomerSelector.tsx'),
      'utf8',
    );
    expect(selector).toContain('data-customer-results="inline"');
    expect(selector).toContain('showDropdown && compact');
    // Absolute overlay remains for non-compact retail POS only.
    expect(selector).toContain('showDropdown && !compact');
  });
});
