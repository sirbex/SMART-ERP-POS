import { describe, expect, it } from 'vitest';
import {
  consolidateKotLines,
  kotLineMergeKey,
  kotLineNotesMergeKey,
} from '../../../shared/utils/consolidateKotLines';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('KOT line consolidation (Samba/Toast kitchen qty)', () => {
  it('sums identical product + notes; keeps different modifiers separate', () => {
    const out = consolidateKotLines([
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: 'EXTRA Salt' },
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: 'EXTRA Salt' },
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: 'EXTRA Salt' },
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: 'EXTRA Salt' },
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: 'EXTRA Salt' },
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: 'Spicy' },
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: 'Mild' },
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: null },
      { productId: 'p1', productName: 'BUSHERA WITH MILK', quantity: 1, lineNotes: '' },
    ]);
    const byNote = Object.fromEntries(
      out.map((r) => [r.lineNotes || '(plain)', r.quantity]),
    );
    expect(byNote['EXTRA Salt']).toBe(5);
    expect(byNote.Spicy).toBe(1);
    expect(byNote.Mild).toBe(1);
    expect(byNote['(plain)']).toBe(2);
    expect(out).toHaveLength(4);
  });

  it('treats tag order as equivalent for merge key', () => {
    expect(kotLineNotesMergeKey('Mild · Spicy')).toBe(kotLineNotesMergeKey('Spicy · Mild'));
    expect(
      kotLineMergeKey({
        productId: 'p1',
        productName: 'X',
        lineNotes: 'EXTRA Salt · Spicy',
      }),
    ).toBe(
      kotLineMergeKey({
        productId: 'p1',
        productName: 'X',
        lineNotes: 'Spicy · EXTRA Salt',
      }),
    );
  });

  it('print + sendKot paths consume consolidateKotLines SSOT', () => {
    const print = readFileSync(resolve(here, '../lib/printRestaurant.ts'), 'utf8');
    const offline = readFileSync(resolve(here, '../lib/restaurantOfflineOps.ts'), 'utf8');
    const service = readFileSync(
      resolve(here, '../../../SamplePOS.Server/src/modules/restaurant/restaurantService.ts'),
      'utf8',
    );
    expect(print).toContain('consolidateKotLines');
    expect(offline).toContain('consolidateKotLines');
    expect(service).toContain('consolidateKotLines');
    expect(service).toContain('toConsolidatedKotItems');
  });
});
