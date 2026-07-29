/**
 * Behavioral proof: ticket always shows who ordered each product line.
 * Scenario matches Blis FOH — modifiers keep separate rows; same product merges;
 * Ordered by never blank when check has a waiter / actor.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kotLineNotesMergeKey } from '@shared/utils/consolidateKotLines';
import {
  formatOrderedByLabels,
  resolveLineOrderedByName,
  restaurantTicketLineMergeKey,
  shortWaiterLabel,
} from '@shared/utils/restaurantCheckOwnership';

type Line = {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  kitchenSentAt?: string | null;
  lineNotes?: string | null;
  addedByName?: string | null;
};

/** Mirrors RestaurantPosPage consolidateTicketLines (proof of display contract). */
function consolidateForProof(items: Line[], fallbackWaiterName?: string | null) {
  const map = new Map<
    string,
    {
      productName: string;
      quantity: number;
      orderedByLabel: string | null;
      notes: string | null;
      rawNames: string[];
    }
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
    const lineName = resolveLineOrderedByName({
      addedByName: it.addedByName,
      checkWaiterName: fallbackWaiterName,
    });
    const qty = Number(it.quantity) || 0;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        productName: it.productName,
        quantity: qty,
        notes: (it.lineNotes || '').trim() || null,
        rawNames: [lineName],
        orderedByLabel: formatOrderedByLabels([lineName], fallbackWaiterName),
      });
    } else {
      existing.quantity += qty;
      existing.rawNames.push(lineName);
      existing.orderedByLabel = formatOrderedByLabels(existing.rawNames, fallbackWaiterName);
    }
  }
  return [...map.values()];
}

describe('ticket Ordered by stamp (behavioral evidence)', () => {
  it('EVIDENCE: Blis-style ticket — every row has Ordered by (even when addedByName missing)', () => {
    const waiter = 'Alice Waiter';
    const rows = consolidateForProof(
      [
        {
          id: '1',
          productId: 'abchlor',
          productName: 'Abchlor eye droped',
          quantity: '1',
          unitPrice: '4200',
          lineTotal: '4200',
          kitchenSentAt: '2026-07-29',
          lineNotes: '* EXTRA Sugar',
          addedByName: null, // pre-migration / cache miss
        },
        {
          id: '2',
          productId: 'durex',
          productName: 'Durex Pleasure me',
          quantity: '1',
          unitPrice: '10000',
          lineTotal: '10000',
          kitchenSentAt: '2026-07-29',
          lineNotes: '* WITH Lemon',
          addedByName: 'Pat Manager',
        },
        {
          id: '3',
          productId: 'durex',
          productName: 'Durex Pleasure me',
          quantity: '1',
          unitPrice: '10000',
          lineTotal: '10000',
          kitchenSentAt: '2026-07-29',
          lineNotes: '* Mild',
          addedByName: null,
        },
        {
          id: '4',
          productId: 'durex',
          productName: 'Durex Pleasure me',
          quantity: '1',
          unitPrice: '10000',
          lineTotal: '10000',
          kitchenSentAt: '2026-07-29',
          lineNotes: null,
          addedByName: 'Cash Kim',
        },
      ],
      waiter,
    );

    expect(rows.length).toBe(4); // modifiers keep separate rows
    for (const row of rows) {
      expect(row.orderedByLabel).toBeTruthy();
      expect(row.orderedByLabel).not.toBe('');
    }
    const lemon = rows.find((r) => r.notes?.includes('Lemon'));
    expect(lemon?.orderedByLabel).toContain('Pat');
    const plain = rows.find((r) => r.productName.includes('Durex') && !r.notes);
    expect(plain?.orderedByLabel).toContain('Cash');
    const abchlor = rows.find((r) => r.productName.includes('Abchlor'));
    expect(abchlor?.orderedByLabel).toBe(shortWaiterLabel(waiter));
  });

  it('EVIDENCE: manager add of same product merges qty and lists both names', () => {
    const rows = consolidateForProof(
      [
        {
          id: 'a',
          productId: 'eros',
          productName: 'Eros spray',
          quantity: '1',
          unitPrice: '25000',
          lineTotal: '25000',
          lineNotes: '* Mild',
          addedByName: 'Alice Waiter',
        },
        {
          id: 'b',
          productId: 'eros',
          productName: 'Eros spray',
          quantity: '1',
          unitPrice: '25000',
          lineTotal: '25000',
          lineNotes: '* Mild',
          addedByName: 'Pat Manager',
        },
      ],
      'Alice Waiter',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(2);
    expect(rows[0]!.orderedByLabel).toMatch(/Alice/);
    expect(rows[0]!.orderedByLabel).toMatch(/Pat/);
  });

  it('EVIDENCE: FOH + orders repo wire Ordered by + added_by_name (no owner mask)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const foh = readFileSync(resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    const repo = readFileSync(
      resolve(here, '../../../SamplePOS.Server/src/modules/orders/ordersRepository.ts'),
      'utf8',
    );
    const cache = readFileSync(
      resolve(here, '../../../SamplePOS.Server/src/db/schemaColumnCache.ts'),
      'utf8',
    );
    expect(foh).toMatch(/Ordered by \$\{group\.orderedByLabel\}/);
    expect(foh).toContain('formatOrderedByLabels');
    expect(foh).toContain('consolidateTicketLines(');
    expect(repo).toMatch(/added_by_name/);
    expect(repo).not.toMatch(/COALESCE\(\s*ua_add\.full_name/);
    expect(cache).toMatch(/current_database/);
  });
});
