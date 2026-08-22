/**
 * BEHAVIORAL proof — Samba Move / split paint must be deterministic (no day-to-day flake).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  assertSplitMovePaintShowsMovedLines,
  buildPartyTabsAfterSplitMove,
  canMoveSelectedUnits,
  createSplitMovePartyPin,
  maxMoveUnitsForGroup,
  resolveActiveOrderIdAfterSplitMove,
  resolveSplitMovePartyPinAfterOpenIds,
  retainOpenTicketIdsWithPartyPin,
} from './restaurantSplitMovePaint';

const results: string[] = [];
const here = resolve(__dirname);

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

describe('PROOF: restaurant split/move paint SSOT (deterministic)', () => {
  it('Move guard: cannot move all units; partial always allowed', () => {
    expect(canMoveSelectedUnits(1, 3)).toBe(true);
    expect(canMoveSelectedUnits(2, 3)).toBe(true);
    expect(canMoveSelectedUnits(3, 3)).toBe(false);
    expect(canMoveSelectedUnits(0, 3)).toBe(false);
    expect(maxMoveUnitsForGroup(2, 3)).toBe(2);
    expect(maxMoveUnitsForGroup(3, 3)).toBe(2);
    pass('unit guards prevent whole-ticket Move');
  });

  it('After Move, active ticket MUST be the new split ticket', () => {
    expect(resolveActiveOrderIdAfterSplitMove('split-uuid')).toBe('split-uuid');
    expect(
      assertSplitMovePaintShowsMovedLines({
        activeOrderId: 'split-uuid',
        splitOrderId: 'split-uuid',
        splitLineUnitCount: 1,
      }),
    ).toBe(true);
    expect(
      assertSplitMovePaintShowsMovedLines({
        activeOrderId: 'source-uuid',
        splitOrderId: 'split-uuid',
        splitLineUnitCount: 1,
      }),
    ).toBe(false);
    pass('activeOrderId switches to split (moved lines visible)');
  });

  it('Party tabs always include source + split with exact totals', () => {
    const tabs = buildPartyTabsAfterSplitMove({
      priorTabs: [{ id: 'source', orderNumber: 'T-1', totalAmount: '300' }],
      source: { id: 'source', orderNumber: 'T-1', totalAmount: 200 },
      split: { id: 'split', orderNumber: 'T-2', totalAmount: 100 },
    });
    expect(tabs.map((t) => t.id).sort()).toEqual(['source', 'split']);
    expect(tabs.find((t) => t.id === 'source')?.totalAmount).toBe('200');
    expect(tabs.find((t) => t.id === 'split')?.totalAmount).toBe('100');
    pass('party strip carries both tickets after Move');
  });

  it('Party pin retains new ticket ids while server openIds lag', () => {
    const pin = createSplitMovePartyPin('table-1', 'source', 'split', 1_000, 60_000);
    const open = new Set(['source']); // server lag — split missing
    const retained = retainOpenTicketIdsWithPartyPin(open, pin, 'table-1', 1_500);
    expect(retained.has('source')).toBe(true);
    expect(retained.has('split')).toBe(true);
    const cleared = resolveSplitMovePartyPinAfterOpenIds({
      pin,
      tableId: 'table-1',
      openIds: new Set(['source', 'split']),
      nowMs: 1_500,
    });
    expect(cleared).toBeNull();
    const expired = retainOpenTicketIdsWithPartyPin(
      new Set(['source']),
      pin,
      'table-1',
      100_000,
    );
    expect(expired.has('split')).toBe(false);
    pass('pin prevents strip scrub of new ticket during refetch race');
  });

  it('FOH + offline replayer wire deterministic Move paint (no stay-on-source)', () => {
    const pos = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(pos).toMatch(/from ['"]\.\.\/\.\.\/lib\/restaurantSplitMovePaint['"]/);
    expect(pos).toMatch(/paintAfterSplitMove/);
    expect(pos).toMatch(/createSplitMovePartyPin|splitMovePartyPinRef/);
    expect(pos).toMatch(/retainOpenTicketIdsWithPartyPin/);
    expect(pos).toMatch(/checkPaintGenRef\.current \+= 1/);
    const splitBlock = pos.slice(
      pos.indexOf('const runSplit'),
      pos.indexOf('const toggleGroupSelection'),
    );
    expect(splitBlock).toMatch(/paintAfterSplitMove\(/);
    expect(splitBlock).not.toMatch(/setActiveOrderId\(order\.id\)/);
    expect(splitBlock).toMatch(/refreshRestaurantCheckSeedFromServer/);

    const replayer = readFileSync(
      resolve(here, '../../../SamplePOS.Server/src/modules/pos/posEventReplayer.ts'),
      'utf8',
    );
    expect(replayer).toMatch(/resolveSourceOrderIdForSplit/);
    pass('FOH + replayer SSOT wiring sealed');
  });
});

afterAll(() => {
  writeFileSync(
    join(here, '../../../PROOF_RESTAURANT_SPLIT_MOVE_PAINT.md'),
    [
      '# PROOF: restaurant split/move paint (deterministic)',
      '',
      `- Date: ${new Date().toISOString()}`,
      '- Runner: `npx vitest run src/lib/restaurantSplitMovePaint.proof.test.ts`',
      '',
      '## Policy',
      'Move must always show moved lines on the new ticket. Party pin + paint gen prevent day-to-day strip/refetch races.',
      '',
      '## Results',
      ...results,
      '',
      '## Verdict',
      results.length >= 5
        ? '**PASS** — deterministic Move paint SSOT.'
        : '**FAIL** — incomplete result set.',
      '',
    ].join('\n'),
    'utf8',
  );
});
