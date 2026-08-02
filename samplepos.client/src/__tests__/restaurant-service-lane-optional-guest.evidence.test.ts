/**
 * EVIDENCE: Takeaway / Delivery guest optional; Quick/service lanes shared vs dining ownership.
 *
 * Run: npx vitest run src/__tests__/restaurant-service-lane-optional-guest.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('EVIDENCE — service lane optional guest + shared Quick sale', () => {
  it('server does not require guest name/address for takeaway/delivery', () => {
    const service = read('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/assertChannelGuest/);
    expect(service).toMatch(/Optional by design/);
    expect(service).not.toMatch(/Guest name is required for delivery orders/);
    expect(service).not.toMatch(/Guest name is required for takeaway orders/);
    expect(service).not.toMatch(/Delivery address is required for delivery orders/);
    expect(service).toMatch(/isSharedRestaurantServiceCounter/);
    expect(service).toMatch(/sharedServiceCounter/);
    expect(service).toMatch(/Quick \/ Takeaway \/ Delivery/);
  });

  it('FOH does not block add without customer on takeaway/delivery', () => {
    const pos = read('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/customer \+ address are optional/);
    expect(pos).toMatch(/Customer \(optional\)/);
    expect(pos).not.toMatch(/Select a customer for delivery/);
    expect(pos).not.toMatch(/Select a customer for takeaway/);
    expect(pos).toMatch(/isServiceChannelTable\(t\)/);
  });
});
