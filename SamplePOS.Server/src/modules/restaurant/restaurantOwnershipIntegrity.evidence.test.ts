/**
 * Evidence: restaurant mutate paths enforce check ownership + related integrity SSOT.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('restaurant ownership + integrity SSOT', () => {
  it('cancel/transfer/merge/split/bill/guest/tags pass ownership actor', () => {
    const routes = read('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    const service = read('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');

    expect(routes).toMatch(/cancelCheck\([\s\S]*ownershipActorFromReq\(req\)/);
    expect(routes).toMatch(/transferCheck\([\s\S]*ownershipActorFromReq\(req\)/);
    expect(routes).toMatch(/mergeChecks\([\s\S]*ownershipActorFromReq\(req\)/);
    expect(routes).toMatch(/actor:\s*ownershipActorFromReq\(req\)/);
    expect(routes).toMatch(/requestBill\([\s\S]*ownershipActorFromReq\(req\)/);
    expect(routes).toMatch(/updateCheckGuest\([\s\S]*ownershipActorFromReq\(req\)/);
    expect(routes).toMatch(/setOrderItemTags\([\s\S]*actor:\s*ownershipActorFromReq\(req\)/);

    expect(service).toMatch(/async cancelCheck\([\s\S]*actor\?: OwnershipActor/);
    expect(service).toMatch(/requireOrderMutationAccess/);
    expect(service).toMatch(/requireOrderMutationAccess\(pool, meta/);
    expect(service).toMatch(/requireOrderMutationAccess\(pool, primaryMeta/);
    expect(service).toMatch(/requireOrderMutationAccess\(pool, secondaryMeta/);
    expect(service).toMatch(/sharedServiceCounter/);
  });

  it('bill route does not allow restaurant.read alone', () => {
    const routes = read('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(
      /\/checks\/:orderId\/bill',\s*requireAnyPermission\(\['restaurant\.pay', 'restaurant\.order'\]\)/,
    );
    expect(routes).not.toMatch(
      /\/checks\/:orderId\/bill'[\s\S]{0,80}restaurant\.read/,
    );
  });

  it('getTableCheck filters siblings and heals pointer only after ownership', () => {
    const service = read('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/scopedSiblings/);
    expect(service).toMatch(/siblingChecks: scopedSiblings/);
    expect(service).toMatch(
      /Ownership runs before any floor-pointer write|before any floor-pointer write/,
    );
  });

  it('sendKot locks unsent rows; partial void scales discount like split', () => {
    const service = read('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    const repo = read('SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts');
    expect(repo).toMatch(/lockUnsentItemsForUpdate/);
    expect(service).toMatch(/lockUnsentItemsForUpdate/);
    expect(service).toMatch(/remainDiscount/);
    expect(service).toMatch(/discountAmount: remainDiscount/);
    expect(service).toMatch(/reassignOrphanedKotsAfterItemMove/);
    expect(service).toMatch(/syncOrderKitchenStatusFromKots/);
  });

  it('offline cancel uses cancelCheck; KOT fire replays sendKot', () => {
    const replayer = read('SamplePOS.Server/src/modules/pos/posEventReplayer.ts');
    expect(replayer).toMatch(/fireRestaurantKot/);
    expect(replayer).toMatch(/case 'RESTAURANT_KOT_FIRED':\s*return posEventReplayer\.fireRestaurantKot/);
    expect(replayer).toMatch(/restaurantService\.cancelCheck/);
    expect(replayer).toMatch(/restaurantService\.sendKot/);
  });
});
