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
  isTableVisibleToWaiter,
  ownsRestaurantCheck,
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

  it('EVIDENCE: Waiter owns own check and can claim unassigned', () => {
    expect(ownsRestaurantCheck(waiter.userId, waiter.userId)).toBe(true);
    expect(ownsRestaurantCheck(null, waiter.userId)).toBe(true);
    expect(ownsRestaurantCheck(otherWaiterId, waiter.userId)).toBe(false);
    expect(canMutateRestaurantCheck({ checkWaiterId: waiter.userId, actor: waiter })).toBe(true);
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
});
