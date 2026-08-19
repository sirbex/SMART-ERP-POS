/**
 * PROOF: menu add must not ask to "select a ticket" on 0/1-ticket tables.
 * Regression: table pick clears activeOrderId; sheet FOH taps menu immediately.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fohMenuAddBlockedMessage,
  resolveFohMenuAddTarget,
  resolveKotFireOrderId,
  resolveKotSessionFinish,
  resolveKotSessionLeave,
  resolvePaintedOrder,
  resolveTableOpenLand,
  resolveTablePickView,
} from './fohMenuAddTarget';

const here = dirname(fileURLToPath(import.meta.url));

describe('FOH menu add target SSOT', () => {
  it('empty table: first tap creates — never select-ticket (sheet race)', () => {
    const d = resolveFohMenuAddTarget({
      partyListVisible: false,
      ticketCount: 0,
      soleTicketId: null,
      activeOrderId: null,
      currentOrderId: null,
      checkSettled: true,
      tableOccupied: false,
      floorOpenCount: 0,
    });
    expect(d).toEqual({ action: 'create-first' });
    expect(fohMenuAddBlockedMessage(d)).toBeNull();
  });

  it('empty table still loading on FREE floor: create (do not block menu)', () => {
    const d = resolveFohMenuAddTarget({
      partyListVisible: false,
      ticketCount: 0,
      soleTicketId: null,
      activeOrderId: null,
      currentOrderId: null,
      checkSettled: false,
      tableOccupied: false,
      floorOpenCount: 0,
    });
    expect(d.action).toBe('create-first');
  });

  it('sole open ticket binds even when activeOrderId was cleared on table pick', () => {
    const d = resolveFohMenuAddTarget({
      partyListVisible: false,
      ticketCount: 1,
      soleTicketId: 'ord-only',
      activeOrderId: null,
      currentOrderId: null,
      checkSettled: true,
      tableOccupied: true,
      floorOpenCount: 1,
    });
    expect(d).toEqual({ action: 'bind', orderId: 'ord-only' });
    expect(fohMenuAddBlockedMessage(d)).toBeNull();
  });

  it('occupied table not yet hydrated: wait — never "select a ticket"', () => {
    const d = resolveFohMenuAddTarget({
      partyListVisible: false,
      ticketCount: 0,
      soleTicketId: null,
      activeOrderId: null,
      currentOrderId: null,
      checkSettled: false,
      tableOccupied: true,
      floorOpenCount: 1,
    });
    expect(d.action).toBe('wait-check');
    expect(fohMenuAddBlockedMessage(d)).toBe('Loading ticket…');
    expect(fohMenuAddBlockedMessage(d)).not.toMatch(/Select a ticket/i);
  });

  it('party list (2+ tickets) is the only select-ticket gate', () => {
    const d = resolveFohMenuAddTarget({
      partyListVisible: true,
      ticketCount: 2,
      soleTicketId: null,
      activeOrderId: null,
      currentOrderId: null,
      checkSettled: true,
      tableOccupied: true,
      floorOpenCount: 2,
    });
    expect(d.action).toBe('select-ticket');
    expect(fohMenuAddBlockedMessage(d)).toBe('Select a ticket to add items');
  });

  it('multi-ticket in detail with active ticket binds (no select)', () => {
    const d = resolveFohMenuAddTarget({
      partyListVisible: false,
      ticketCount: 2,
      soleTicketId: null,
      activeOrderId: 'ord-a',
      currentOrderId: 'ord-a',
      checkSettled: true,
      tableOccupied: true,
      floorOpenCount: 2,
    });
    expect(d).toEqual({ action: 'bind', orderId: 'ord-a' });
  });

  it('floor says 2+ but strip not hydrated: wait — never select with no picker', () => {
    const d = resolveFohMenuAddTarget({
      partyListVisible: false,
      ticketCount: 0,
      soleTicketId: null,
      activeOrderId: null,
      currentOrderId: null,
      checkSettled: false,
      tableOccupied: true,
      floorOpenCount: 2,
    });
    expect(d.action).toBe('wait-check');
    expect(fohMenuAddBlockedMessage(d)).not.toMatch(/Select a ticket/i);
  });

  it('2+ tickets listed, no pointer, list not showing: still select (must pick)', () => {
    const d = resolveFohMenuAddTarget({
      partyListVisible: false,
      ticketCount: 2,
      soleTicketId: null,
      activeOrderId: null,
      currentOrderId: null,
      checkSettled: true,
      tableOccupied: true,
      floorOpenCount: 2,
    });
    expect(d.action).toBe('select-ticket');
  });

  it('FOH page uses SSOT helper — regression of !activeOrderId && !order.id throw is forbidden', () => {
    const pos = readFileSync(resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    expect(pos).toMatch(/resolveFohMenuAddTarget/);
    expect(pos).toMatch(/fohMenuAddBlockedMessage/);
    expect(pos).not.toMatch(
      /if\s*\(\s*!activeOrderId\s*&&\s*!order\?\.id\s*\)\s*\{\s*throw new Error\(\s*['"]Select a ticket to add items['"]/,
    );
    expect(pos).not.toMatch(/if \(!paintOpenedCheck\) return null/);
    expect(pos).toMatch(/showSambaTicketList = isMultiTicketTable && sambaTicketView === 'list'/);
  });

  it('2+ known: land on list; do not lock detail on 0/1 tabs first', () => {
    expect(
      resolveTableOpenLand({
        alreadyLanded: false,
        ticketCount: 0,
        siblingCount: 0,
        floorOpenCount: 2,
        settled: false,
      }),
    ).toBe('list');
    expect(
      resolveTableOpenLand({
        alreadyLanded: false,
        ticketCount: 1,
        siblingCount: 2,
        floorOpenCount: 1,
        settled: true,
      }),
    ).toBe('list');
  });

  it('after land: hold — pick / Back / merge / close own the view', () => {
    expect(
      resolveTableOpenLand({
        alreadyLanded: true,
        ticketCount: 2,
        siblingCount: 2,
        floorOpenCount: 2,
        settled: true,
      }),
    ).toBe('hold');
  });

  it('sole ticket settled: detail (menu ready, no picker)', () => {
    expect(
      resolveTableOpenLand({
        alreadyLanded: false,
        ticketCount: 1,
        siblingCount: 1,
        floorOpenCount: 1,
        settled: true,
      }),
    ).toBe('detail');
  });

  it('1 tab not settled: hold so siblings can still land as list', () => {
    expect(
      resolveTableOpenLand({
        alreadyLanded: false,
        ticketCount: 1,
        siblingCount: 0,
        floorOpenCount: 1,
        settled: false,
      }),
    ).toBe('hold');
  });
});

describe('FOH table pick / KOT session — enterprise lock', () => {
  it('pick: known 2+ is list; sole 1 is detail; occupied unknown is list (no last-touched flash)', () => {
    expect(resolveTablePickView({ floorOpenCount: 2, occupied: true })).toBe('list');
    expect(resolveTablePickView({ floorOpenCount: 3, occupied: true })).toBe('list');
    expect(resolveTablePickView({ floorOpenCount: 1, occupied: true })).toBe('detail');
    expect(resolveTablePickView({ floorOpenCount: 0, occupied: false })).toBe('detail');
    expect(resolveTablePickView({ floorOpenCount: 0, occupied: true })).toBe('list');
  });

  it('land after known-2+ pick: hold — hydrate must not flip list → last-touched detail', () => {
    expect(
      resolveTableOpenLand({
        alreadyLanded: true,
        ticketCount: 1,
        siblingCount: 1,
        floorOpenCount: 1,
        settled: true,
      }),
    ).toBe('hold');
  });

  it('KOT leave: 2+ or party list leaves; sole ticket stays', () => {
    expect(resolveKotSessionLeave({ ticketCount: 2, partyListVisible: false })).toBe(true);
    expect(resolveKotSessionLeave({ ticketCount: 1, partyListVisible: true })).toBe(true);
    expect(resolveKotSessionLeave({ ticketCount: 1, partyListVisible: false })).toBe(false);
    expect(resolveKotSessionLeave({ ticketCount: 0, partyListVisible: false })).toBe(false);
  });

  it('KOT fire id: chosen ticket wins; last-touched only when none chosen', () => {
    expect(
      resolveKotFireOrderId({ activeOrderId: 'ord-a', paintedOrderId: 'ord-b' }),
    ).toBe('ord-a');
    expect(resolveKotFireOrderId({ activeOrderId: null, paintedOrderId: 'ord-b' })).toBe(
      'ord-b',
    );
    expect(resolveKotFireOrderId({ activeOrderId: null, paintedOrderId: null })).toBeNull();
  });

  it('KOT finish: waiter logout always; manager 2+ floor; manager 1 stay', () => {
    expect(
      resolveKotSessionFinish({
        ticketCount: 2,
        partyListVisible: true,
        waiterShouldLogout: true,
      }),
    ).toBe('logout');
    expect(
      resolveKotSessionFinish({
        ticketCount: 1,
        partyListVisible: false,
        waiterShouldLogout: true,
      }),
    ).toBe('logout');
    expect(
      resolveKotSessionFinish({
        ticketCount: 2,
        partyListVisible: true,
        waiterShouldLogout: false,
      }),
    ).toBe('floor');
    expect(
      resolveKotSessionFinish({
        ticketCount: 1,
        partyListVisible: false,
        waiterShouldLogout: false,
      }),
    ).toBe('stay');
  });

  it('painted board never shows another ticket; missing paint is blank not blended', () => {
    expect(resolvePaintedOrder({ id: 'a', items: [1] }, 'a')?.id).toBe('a');
    expect(resolvePaintedOrder({ id: 'b', items: [1] }, 'a')).toBeNull();
    expect(resolvePaintedOrder(null, 'a')).toBeNull();
    expect(resolvePaintedOrder({ id: 'last' }, null)?.id).toBe('last');
  });

  it('FOH page wires pick/land/KOT/paint SSOT — no inline 2+ leave or pick ternary', () => {
    const pos = readFileSync(resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    expect(pos).toMatch(/resolveTablePickView/);
    expect(pos).toMatch(/resolveKotSessionLeave/);
    expect(pos).toMatch(/resolveKotSessionFinish/);
    expect(pos).toMatch(/resolveKotFireOrderId/);
    expect(pos).toMatch(/resolvePaintedOrder/);
    expect(pos).not.toMatch(
      /floorOpenCount > 1 \|\| \(occupied && floorOpenCount !== 1\) \? 'list' : 'detail'/,
    );
    expect(pos).not.toMatch(/ticketTabs\.length > 1 \|\| showSambaTicketList/);
  });

  it('ticket note paints on this ticket and returns to it (never menu dump)', () => {
    const pos = readFileSync(resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    expect(pos).toMatch(/paintTicketNoteNow/);
    expect(pos).toMatch(/returnToTicketSheet/);
    expect(pos).toMatch(/applyTicketNoteToCheck/);
    expect(pos).toMatch(/updateRestaurantCheckNotesOffline/);
    expect(pos).toMatch(/resolveTicketNoteOnCheckPaint/);
    expect(pos).toMatch(/ticketNoteOnCheck\.visibleText/);
    expect(pos).toMatch(/data-ticket-note-on-check="true"/);
    expect(pos).toMatch(/preview=\{orderLines\.length === 0 \? 'empty' : 'true'\}/);
    expect(pos).toMatch(/setMobileSheet\(useSheetTicket \? 'order' : null\)/);
    expect(pos).toMatch(/data-ticket-note="open"/);
    expect(pos).toMatch(/data-ticket-note="dock"/);
    expect(pos).toMatch(/data-ticket-note-empty=/);
    expect(pos).toMatch(/\{text \|\| 'Add note'\}/);
    expect(pos).not.toMatch(/order && inlineTicketNote \?/);
    expect(pos).not.toMatch(/\{ticketNote \? \(\s*<TicketNotePreview/);
    expect(pos).not.toMatch(/preview="true"/);
  });

  it('wiring only: check-body note is in ticket lines, not the KOT bar', () => {
    const pos = readFileSync(resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    const ticketBody =
      pos.split('data-ticket-lines="true"')[1]?.split('data-ticket-primary-actions')[0] ?? '';
    const kotBar = pos.split('data-ticket-primary-actions')[1] ?? '';
    expect(ticketBody).toMatch(/ticketNoteOnCheck\.paint === 'on-check'/);
    expect(ticketBody).toMatch(/TicketNotePreview/);
    expect(ticketBody).toMatch(/ticketNoteOnCheck\.visibleText/);
    expect(kotBar).not.toMatch(/TicketNotePreview/);
  });
});
