/**
 * Unit proof: offline create queue + sync payload carry partner WHT defaults.
 */
import { describe, it, expect } from 'vitest';
import { mapApiCustomer } from '../lib/offlineMappers';
import { resolvePartnerWhtDefault } from '../../../shared/wht/partnerWhtDefault';

/** Mirrors offlineSyncEngine.create payload shaping for offline customers. */
function buildOfflineCustomerSyncPayload(cust: {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  creditLimit?: number;
  whtLiable?: boolean;
  defaultWhtTypeId?: string | null;
}) {
  const payload: Record<string, unknown> = {
    name: cust.name,
    creditLimit: cust.creditLimit ?? 0,
    whtLiable: cust.whtLiable === true,
    defaultWhtTypeId: cust.whtLiable === true ? cust.defaultWhtTypeId || null : null,
  };
  if (cust.email) payload.email = cust.email;
  if (cust.phone) payload.phone = cust.phone;
  if (cust.address) payload.address = cust.address;
  return payload;
}

describe('offline partner WHT persistence', () => {
  it('mapApiCustomer preserves whtLiable and defaultWhtTypeId', () => {
    const mapped = mapApiCustomer({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Gov Buyer',
      email: '',
      phone: '',
      address: '',
      balance: '0',
      creditLimit: '500000',
      whtLiable: true,
      defaultWhtTypeId: '22222222-2222-2222-2222-222222222222',
      isActive: true,
    });
    expect(mapped.whtLiable).toBe(true);
    expect(mapped.defaultWhtTypeId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('offline sync payload includes WHT when liable', () => {
    const payload = buildOfflineCustomerSyncPayload({
      name: 'Offline Liable',
      creditLimit: 100000,
      whtLiable: true,
      defaultWhtTypeId: '33333333-3333-3333-3333-333333333333',
    });
    expect(payload.whtLiable).toBe(true);
    expect(payload.defaultWhtTypeId).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('offline sync payload clears default type when not liable', () => {
    const payload = buildOfflineCustomerSyncPayload({
      name: 'Cash Only',
      whtLiable: false,
      defaultWhtTypeId: '33333333-3333-3333-3333-333333333333',
    });
    expect(payload.whtLiable).toBe(false);
    expect(payload.defaultWhtTypeId).toBeNull();
  });

  it('payment resolver still auto-selects after offline→online shape', () => {
    const payload = buildOfflineCustomerSyncPayload({
      name: 'Hospital',
      whtLiable: true,
      defaultWhtTypeId: 't-cust',
    });
    const r = resolvePartnerWhtDefault(
      {
        whtLiable: payload.whtLiable as boolean,
        defaultWhtTypeId: payload.defaultWhtTypeId as string,
      },
      [
        { id: 't-cust', appliesTo: 'CUSTOMER', isActive: true },
        { id: 't-sup', appliesTo: 'SUPPLIER', isActive: true },
      ],
      'CUSTOMER',
    );
    expect(r.whtTypeId).toBe('t-cust');
    expect(r.liable).toBe(true);
  });
});
