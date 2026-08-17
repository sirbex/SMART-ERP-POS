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

  it('2+ tickets, no pointer, list not showing: still select (must pick)', () => {
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
  });
});
