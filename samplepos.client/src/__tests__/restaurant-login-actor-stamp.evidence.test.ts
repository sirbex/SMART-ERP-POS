/**
 * Proof: cashier/admin rings show THEIR name (not check owner);
 * line clock + table open duration (Toast/Aloha).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kotLineNotesMergeKey } from '@shared/utils/consolidateKotLines';
import {
  formatCheckOpenDuration,
  formatLineAddedClock,
  formatOrderedByLabels,
  restaurantTicketLineMergeKey,
} from '@shared/utils/restaurantCheckOwnership';

type Line = {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineNotes?: string | null;
  addedByName?: string | null;
  addedAt?: string | null;
  kitchenSentAt?: string | null;
};

function consolidate(items: Line[], fallback?: string | null) {
  const map = new Map<
    string,
    { qty: number; orderedBy: string | null; addedAt: string | null; name: string }
  >();
  for (const it of items) {
    const key = restaurantTicketLineMergeKey({
      productId: it.productId,
      productName: it.productName,
      unitPrice: Number(it.unitPrice) || 0,
      kitchenSent: !!it.kitchenSentAt,
      lineNotes: it.lineNotes,
      notesMergeKey: kotLineNotesMergeKey,
    });
    const row = map.get(key);
    if (!row) {
      map.set(key, {
        name: it.productName,
        qty: Number(it.quantity) || 0,
        orderedBy: formatOrderedByLabels([it.addedByName], fallback),
        addedAt: formatLineAddedClock(it.addedAt),
      });
    } else {
      row.qty += Number(it.quantity) || 0;
      row.orderedBy = formatOrderedByLabels(
        [...(row.orderedBy ? [row.orderedBy] : []), it.addedByName].filter(Boolean) as string[],
        fallback,
      );
      // recompute from stamps only:
      row.orderedBy = formatOrderedByLabels(
        items
          .filter(
            (x) =>
              restaurantTicketLineMergeKey({
                productId: x.productId,
                productName: x.productName,
                unitPrice: Number(x.unitPrice) || 0,
                kitchenSent: !!x.kitchenSentAt,
                lineNotes: x.lineNotes,
                notesMergeKey: kotLineNotesMergeKey,
              }) === key,
          )
          .map((x) => x.addedByName),
        fallback,
      );
    }
  }
  return [...map.values()];
}

describe('login-user Ordered by + timers (behavioral evidence)', () => {
  it('EVIDENCE: waiter then cashier on same table — cashier line shows cashier, not waiter', () => {
    const rows = consolidate(
      [
        {
          id: '1',
          productId: 'ab',
          productName: 'Abchlor',
          quantity: '1',
          unitPrice: '4200',
          lineNotes: '* EXTRA Sugar',
          addedByName: 'Alice Waiter',
          addedAt: '2026-07-29T15:00:00.000Z',
        },
        {
          id: '2',
          productId: 'oz',
          productName: 'OZEMPIC',
          quantity: '1',
          unitPrice: '1500000',
          lineNotes: '* WITH Lemon',
          addedByName: 'Admin Chase',
          addedAt: '2026-07-29T15:20:00.000Z',
        },
      ],
      'Alice Waiter', // check owner — must NOT overwrite admin stamp
    );

    const waiterLine = rows.find((r) => r.name === 'Abchlor');
    const adminLine = rows.find((r) => r.name === 'OZEMPIC');
    expect(waiterLine?.orderedBy).toMatch(/Alice/);
    expect(adminLine?.orderedBy).toMatch(/Admin|Chase/);
    expect(adminLine?.orderedBy).not.toMatch(/Alice/);
    expect(adminLine?.addedAt).toBeTruthy();
  });

  it('EVIDENCE: does not paint every blank line as check owner when stamps exist on others', () => {
    // One stamped cashier line + one legacy null → only null uses fallback
    const rows = consolidate(
      [
        {
          id: '1',
          productId: 'd1',
          productName: 'Durex',
          quantity: '1',
          unitPrice: '10000',
          lineNotes: '* Mild',
          addedByName: null,
        },
        {
          id: '2',
          productId: 'd2',
          productName: 'Eros spray',
          quantity: '1',
          unitPrice: '25000',
          lineNotes: '* Mild',
          addedByName: 'Cash Kim',
        },
      ],
      'Alice Waiter',
    );
    expect(rows.find((r) => r.name === 'Durex')?.orderedBy).toBe('Alice W.');
    expect(rows.find((r) => r.name === 'Eros spray')?.orderedBy).toMatch(/Cash/);
  });

  it('EVIDENCE: table open duration formats like Toast timer', () => {
    const now = Date.parse('2026-07-29T16:00:00.000Z');
    expect(formatCheckOpenDuration('2026-07-29T15:47:00.000Z', now)).toBe('13m');
    expect(formatCheckOpenDuration('2026-07-29T14:00:00.000Z', now)).toBe('2h');
    expect(formatCheckOpenDuration(null, now)).toBeNull();
  });

  it('EVIDENCE: wiring — no waiter COALESCE mask; added_at + check_opened_at + Open label', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const repo = readFileSync(
      resolve(here, '../../../SamplePOS.Server/src/modules/orders/ordersRepository.ts'),
      'utf8',
    );
    const tables = readFileSync(
      resolve(here, '../../../SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts'),
      'utf8',
    );
    const foh = readFileSync(resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    const sql = readFileSync(
      resolve(here, '../../../shared/sql/574_restaurant_line_added_at.sql'),
      'utf8',
    );

    expect(repo).toMatch(/ua_add\.full_name AS added_by_name/);
    expect(repo).not.toMatch(/COALESCE\(\s*ua_add\.full_name/);
    expect(repo).toMatch(/added_at/);
    expect(tables).toMatch(/check_opened_at/);
    expect(foh).toMatch(/Ordered by \$\{group\.orderedByLabel\}/);
    expect(foh).toMatch(/Open \{openFor\}/);
    expect(foh).toMatch(/formatCheckOpenDuration/);
    expect(sql).toMatch(/added_at/);
  });
});
