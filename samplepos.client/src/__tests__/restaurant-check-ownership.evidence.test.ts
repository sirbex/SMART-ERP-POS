/**
 * Behavioral evidence: multi-waiter table ownership + edit-others (Toast/Aloha).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canEditOtherWaitersChecks,
  canMutateRestaurantCheck,
  formatOrderedByLabels,
  isSharedRestaurantServiceCounter,
  isTableVisibleToWaiter,
  ownsRestaurantCheck,
  restaurantTicketLineMergeKey,
  shortWaiterLabel,
} from '@shared/utils/restaurantCheckOwnership';

const waiter = {
  userId: 'waiter-a',
  role: 'STAFF',
  permissions: ['restaurant.read', 'restaurant.order', 'customers.read'],
};

const otherWaiterId = 'waiter-b';

const manager = {
  userId: 'mgr-1',
  role: 'MANAGER',
  permissions: ['restaurant.read', 'restaurant.order', 'restaurant.manage'],
};

const cashier = {
  userId: 'cash-1',
  role: 'CASHIER',
  permissions: ['restaurant.read', 'restaurant.order', 'restaurant.pay'],
};

describe('restaurant check ownership (behavioral evidence)', () => {
  it('EVIDENCE: Waiter cannot edit another waiter’s check; Manager/Cashier can', () => {
    expect(canEditOtherWaitersChecks(waiter)).toBe(false);
    expect(canEditOtherWaitersChecks(manager)).toBe(true);
    expect(canEditOtherWaitersChecks(cashier)).toBe(true);

    expect(canMutateRestaurantCheck({ checkWaiterId: otherWaiterId, actor: waiter })).toBe(false);
    expect(canMutateRestaurantCheck({ checkWaiterId: otherWaiterId, actor: manager })).toBe(true);
  });

  it('EVIDENCE: Legacy CASHIER role edits peer checks without RBAC permission list', () => {
    expect(
      canEditOtherWaitersChecks({
        userId: 'cash-legacy',
        role: 'CASHIER',
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canMutateRestaurantCheck({
        checkWaiterId: otherWaiterId,
        actor: { userId: 'cash-legacy', role: 'CASHIER', permissions: [] },
      }),
    ).toBe(true);
  });

  it('EVIDENCE: Super-Admin RBAC (admin.*) edits peers even if users.role is STAFF', () => {
    expect(
      canEditOtherWaitersChecks({
        userId: 'misseeded-admin',
        role: 'STAFF',
        permissions: ['admin.read', 'admin.update', 'restaurant.order'],
      }),
    ).toBe(true);
    expect(
      canMutateRestaurantCheck({
        checkWaiterId: otherWaiterId,
        actor: {
          userId: 'misseeded-admin',
          role: 'STAFF',
          permissions: ['admin.read'],
        },
      }),
    ).toBe(true);
  });

  it('EVIDENCE: Waiter owns own check and can claim unassigned', () => {
    expect(ownsRestaurantCheck(waiter.userId, waiter.userId)).toBe(true);
    expect(ownsRestaurantCheck(null, waiter.userId)).toBe(true);
    expect(ownsRestaurantCheck(otherWaiterId, waiter.userId)).toBe(false);
    expect(canMutateRestaurantCheck({ checkWaiterId: waiter.userId, actor: waiter })).toBe(true);
  });

  it('EVIDENCE: Quick / Takeaway / Delivery are counter-only (not floor waiters)', () => {
    expect(isSharedRestaurantServiceCounter({ tableCode: 'QK', tableZone: 'SERVICE' })).toBe(
      true,
    );
    expect(isSharedRestaurantServiceCounter({ tableCode: 'TA', tableZone: 'SERVICE' })).toBe(
      true,
    );
    expect(isSharedRestaurantServiceCounter({ tableCode: 'T1', tableZone: 'MAIN' })).toBe(false);

    // Pure waiters cannot open or mutate service counters
    expect(
      canMutateRestaurantCheck({
        checkWaiterId: otherWaiterId,
        actor: waiter,
        sharedServiceCounter: true,
      }),
    ).toBe(false);
    expect(
      isTableVisibleToWaiter({
        tableStatus: 'OCCUPIED',
        checkWaiterId: otherWaiterId,
        sharedServiceCounter: true,
        actor: waiter,
      }),
    ).toBe(false);

    // Managers and cashiers can
    expect(
      canMutateRestaurantCheck({
        checkWaiterId: otherWaiterId,
        actor: manager,
        sharedServiceCounter: true,
      }),
    ).toBe(true);
    expect(
      canMutateRestaurantCheck({
        checkWaiterId: otherWaiterId,
        actor: cashier,
        sharedServiceCounter: true,
      }),
    ).toBe(true);
    expect(
      isTableVisibleToWaiter({
        tableStatus: 'OCCUPIED',
        checkWaiterId: otherWaiterId,
        sharedServiceCounter: true,
        actor: cashier,
      }),
    ).toBe(true);
  });

  it('EVIDENCE: Floor — waiter sees FREE + own occupied; not peer occupied', () => {
    expect(
      isTableVisibleToWaiter({
        tableStatus: 'FREE',
        checkWaiterId: null,
        actor: waiter,
      }),
    ).toBe(true);

    expect(
      isTableVisibleToWaiter({
        tableStatus: 'OCCUPIED',
        checkWaiterId: waiter.userId,
        actor: waiter,
      }),
    ).toBe(true);

    expect(
      isTableVisibleToWaiter({
        tableStatus: 'OCCUPIED',
        checkWaiterId: otherWaiterId,
        actor: waiter,
      }),
    ).toBe(false);

    expect(
      isTableVisibleToWaiter({
        tableStatus: 'OCCUPIED',
        checkWaiterId: otherWaiterId,
        actorOwnsAnyCheckOnTable: true,
        actor: waiter,
      }),
    ).toBe(true);

    expect(
      isTableVisibleToWaiter({
        tableStatus: 'OCCUPIED',
        checkWaiterId: otherWaiterId,
        actor: manager,
      }),
    ).toBe(true);
  });

  it('EVIDENCE: shortWaiterLabel for ticket attribution', () => {
    expect(shortWaiterLabel('Alice Nakato')).toBe('Alice N.');
    expect(shortWaiterLabel('Sam')).toBe('Sam');
  });

  it('EVIDENCE: same product from waiter + manager stays one ticket row with both names', () => {
    const keyWaiter = restaurantTicketLineMergeKey({
      productId: 'p1',
      productName: 'Smoothie',
      unitPrice: 15000,
      kitchenSent: false,
      lineNotes: null,
      notesMergeKey: (n) => n,
    });
    const keyManager = restaurantTicketLineMergeKey({
      productId: 'p1',
      productName: 'Smoothie',
      unitPrice: 15000,
      kitchenSent: false,
      lineNotes: null,
      notesMergeKey: (n) => n,
    });
    expect(keyWaiter).toBe(keyManager);
    expect(formatOrderedByLabels(['Alice Waiter', 'Pat Manager'])).toBe('Alice W., Pat M.');
    expect(formatOrderedByLabels(['Cashier Kim', 'Cashier Kim'])).toBe('Cashier K.');
    expect(formatOrderedByLabels([null, null], 'Alice Waiter')).toBe('Alice W.');
  });

  it('EVIDENCE: migration + service wire ownership + added_by', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const sql = readFileSync(
      resolve(root, 'shared/sql/573_restaurant_check_ownership.sql'),
      'utf8',
    );
    const service = readFileSync(
      resolve(root, 'SamplePOS.Server/src/modules/restaurant/restaurantService.ts'),
      'utf8',
    );
    const repo = readFileSync(
      resolve(root, 'SamplePOS.Server/src/modules/orders/ordersRepository.ts'),
      'utf8',
    );

    expect(sql).toMatch(/added_by/);
    expect(sql).toMatch(/restaurant\.edit_others/);
    expect(sql).toMatch(/rbac_permissions_catalog/);
    expect(service).toMatch(/canMutateRestaurantCheck|canEditOtherWaitersChecks/);
    expect(service).toMatch(/addedBy|added_by/);
    expect(repo).toMatch(/added_by|addedBy/);
  });

  it('EVIDENCE: FOH merges product rows without splitting by adder', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const foh = readFileSync(resolve(root, 'pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    expect(foh).toContain('restaurantTicketLineMergeKey');
    expect(foh).toContain('formatOrderedByLabels');
    expect(foh).toMatch(/Ordered by \$\{group\.orderedByLabel\}/);
    // Must not re-introduce adder-split merge keys
    expect(foh).not.toMatch(/kotLineNotesMergeKey\(notes\)\}\|\$\{adder\}/);
  });
});
