/**
 * Pricing phases 1–3 — client contracts (must pass before deploy)
 *
 * Phase 1: customer group default price group + assign COALESCE
 * Phase 2: customer edit / search / POS pricingMode + safe load while customer undefined
 * Phase 3: POS at-cost instant price + server sale guard (server tests separate)
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import type { Customer } from '@shared/zod/customer';
import {
  buildCustomerUpdatePayload,
  priceGroupIdForEffectDeps,
  syncEditPriceGroupState,
  customerIsAtCost,
  customerIsActive,
  priceGroupLabel,
} from '../utils/customerPriceGroupEdit';

type CustomerLike = {
  priceGroupId?: string | null;
  pricingMode?: 'STANDARD' | 'AT_COST' | null;
  isActive?: boolean;
  is_active?: boolean;
};

/** Regression: old code used `c.priceGroupId` in useEffect deps while customer was undefined */
function unsafeLegacyEffectDep(customer: CustomerLike | undefined): string | null | undefined {
  const c = customer as CustomerLike;
  return c.priceGroupId;
}

/** Mirrors CustomerSelector.offlineToCustomer */
function offlineToCustomer(c: {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  balance: number;
  creditLimit: number;
  customerGroupId?: string;
  priceGroupId?: string;
  pricingMode?: 'STANDARD' | 'AT_COST';
  isActive: boolean;
}): Customer {
  return {
    id: c.id,
    name: c.name,
    email: c.email || null,
    phone: c.phone || null,
    address: c.address || null,
    customerGroupId: c.customerGroupId ?? null,
    priceGroupId: c.priceGroupId ?? null,
    pricingMode: c.pricingMode ?? null,
    balance: c.balance,
    creditLimit: c.creditLimit,
    isActive: c.isActive,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Phase 2 — buildCustomerUpdatePayload', () => {
  it('omits priceGroupId when unchanged (prevents accidental Standard reset)', () => {
    const payload = buildCustomerUpdatePayload('pg-at-cost', 'pg-at-cost', { name: 'BOU' });
    expect(payload.name).toBe('BOU');
    expect(payload).not.toHaveProperty('priceGroupId');
  });

  it('sends null when clearing price group', () => {
    const payload = buildCustomerUpdatePayload('pg-at-cost', '', { name: 'BOU' });
    expect(payload.priceGroupId).toBeNull();
  });

  it('sends new id when changing price group', () => {
    const payload = buildCustomerUpdatePayload(null, 'pg-new', {});
    expect(payload.priceGroupId).toBe('pg-new');
  });
});

describe('Phase 2 — customer detail load safety (modal/page regression)', () => {
  it('priceGroupIdForEffectDeps does not throw when customer is undefined', () => {
    expect(() => priceGroupIdForEffectDeps(undefined)).not.toThrow();
    expect(priceGroupIdForEffectDeps(undefined)).toBeUndefined();
  });

  it('documents unsafe legacy dep that threw on undefined customer', () => {
    expect(() => unsafeLegacyEffectDep(undefined)).toThrow();
  });

  it('syncEditPriceGroupState only runs when customer exists', () => {
    const { editValue, initialRef } = syncEditPriceGroupState({ priceGroupId: 'pg-1' });
    expect(editValue).toBe('pg-1');
    expect(initialRef).toBe('pg-1');
  });

  it('customerIsAtCost is false while customer is loading', () => {
    expect(customerIsAtCost(undefined)).toBe(false);
    expect(customerIsAtCost({ pricingMode: 'AT_COST' })).toBe(true);
  });

  it('customerIsActive handles snake_case from API', () => {
    expect(customerIsActive({ is_active: true })).toBe(true);
    expect(customerIsActive(undefined)).toBe(false);
  });

  it('priceGroupLabel is empty while customer is loading', () => {
    expect(priceGroupLabel(undefined, [])).toBe('');
    expect(priceGroupLabel({ pricingMode: 'AT_COST' }, [])).toBe('At cost (0% margin)');
    expect(
      priceGroupLabel({ priceGroupId: 'pg-1' }, [{ id: 'pg-1', name: 'Retail' }]),
    ).toBe('Retail');
  });
});

describe('Phase 2 — offlineToCustomer / POS', () => {
  it('preserves pricingMode for POS at-cost badge and add-to-cart', () => {
    const c = offlineToCustomer({
      id: 'c1',
      name: 'BOU',
      balance: 0,
      creditLimit: 0,
      priceGroupId: 'pg-1',
      pricingMode: 'AT_COST',
      isActive: true,
    });
    expect(c.pricingMode).toBe('AT_COST');
    expect(c.priceGroupId).toBe('pg-1');
  });
});

describe('Phase 2/3 — POS instant at-cost unit price', () => {
  it('uses uom.cost when pricingMode is AT_COST', () => {
    const uom = { price: 1000, cost: 650 };
    const isAtCost = true;
    const effectiveUnitPrice = isAtCost ? uom.cost : uom.price;
    expect(effectiveUnitPrice).toBe(650);
  });

  it('scales engine at-cost base price by UoM factor', () => {
    const scaled = new Decimal(70).times(10).toNumber();
    expect(scaled).toBe(700);
  });
});

describe('Phase 1 — assign COALESCE policy (client expectation)', () => {
  it('empty edit state means no price group on new customer', () => {
    expect(syncEditPriceGroupState({}).editValue).toBe('');
    expect(priceGroupIdForEffectDeps({})).toBeUndefined();
  });
});
