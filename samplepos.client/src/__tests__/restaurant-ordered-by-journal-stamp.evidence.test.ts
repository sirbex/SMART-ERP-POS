/**
 * Proof: journal rebuild must not paint every line as check waiter.
 * Blis bug: waiter + admin add → both showed "Ordered by Mercy" after server refresh.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatOrderedByLabels } from '@shared/utils/restaurantCheckOwnership';

const here = dirname(fileURLToPath(import.meta.url));

/** Mirrors checkUiAfterServerSeed attribution overlay. */
function overlayAttribution(
  journalItems: Array<{
    id: string;
    productName: string;
    addedByName?: string | null;
  }>,
  serverItems: Array<{
    id: string;
    productName: string;
    addedByName?: string | null;
  }>,
  fallbackWaiter: string,
) {
  const byId = new Map(serverItems.map((it) => [it.id, it] as const));
  return journalItems.map((it) => {
    const server = byId.get(it.id);
    const addedByName = server?.addedByName ?? it.addedByName ?? null;
    return {
      productName: it.productName,
      orderedBy: formatOrderedByLabels([addedByName], fallbackWaiter),
    };
  });
}

describe('journal must not wipe Ordered by stamps (Blis)', () => {
  it('EVIDENCE: after refresh overlay — admin line stays admin, waiter line stays waiter', () => {
    const rows = overlayAttribution(
      [
        // Journal historically painted both as check owner
        { id: 'line-tilapia', productName: 'TILAPIA FILLET', addedByName: 'Mercy M.' },
        { id: 'line-smoothie', productName: 'BANANA SMOOTHIE', addedByName: 'Mercy M.' },
      ],
      [
        { id: 'line-tilapia', productName: 'TILAPIA FILLET', addedByName: 'Mercy M.' },
        { id: 'line-smoothie', productName: 'BANANA SMOOTHIE', addedByName: 'System Administrator' },
      ],
      'Mercy M.',
    );
    expect(rows.find((r) => r.productName === 'TILAPIA FILLET')?.orderedBy).toMatch(/Mercy/);
    expect(rows.find((r) => r.productName === 'BANANA SMOOTHIE')?.orderedBy).toMatch(
      /System|Admin/,
    );
    expect(rows.find((r) => r.productName === 'BANANA SMOOTHIE')?.orderedBy).not.toMatch(/Mercy/);
  });

  it('EVIDENCE gate: EventLine + seed + uiFromDerivedCheck + overlay wiring', () => {
    const journal = readFileSync(resolve(here, '../lib/offlineEventJournal.ts'), 'utf8');
    const ops = readFileSync(resolve(here, '../lib/restaurantOfflineOps.ts'), 'utf8');
    const foh = readFileSync(resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'), 'utf8');

    expect(journal).toMatch(/addedByName\?:/);
    expect(ops).toMatch(/addedByName: it\.addedByName/);
    expect(ops).toMatch(/addedBy: input\.addedBy/);
    expect(foh).toMatch(/addedByName: l\.addedByName/);
    expect(foh).toMatch(/server\.addedByName \?\? it\.addedByName/);
    expect(foh).not.toMatch(/addedByName: derived\.waiterName/);
  });
});
