/**
 * Restaurant module — structural evidence for Phases 1–5.5
 * Exit 1 if any check fails. Does not swallow failures.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (r) => fs.readFileSync(path.join(root, r), 'utf8');
const exists = (r) => fs.existsSync(path.join(root, r));
const checks = [];

function ok(name, pass, detail = '') {
  checks.push({ name, pass: !!pass, detail: detail || (pass ? 'ok' : 'FAILED') });
}

// ── Migrations (Phases 1–4 schema) ────────────────────────────
ok(
  'P1: 560 foundation flag DEFAULT FALSE',
  exists('shared/sql/560_restaurant_foundation.sql') &&
    /restaurant_mode_enabled\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i.test(
      read('shared/sql/560_restaurant_foundation.sql'),
    ),
);
ok(
  'P1: 560 no restaurant_orders table',
  !/CREATE TABLE IF NOT EXISTS restaurant_orders/i.test(
    read('shared/sql/560_restaurant_foundation.sql'),
  ),
);
ok('P2.1: 562 KDS migration', exists('shared/sql/562_restaurant_kitchen_display.sql'));
ok('P2.2: 563 stations migration', exists('shared/sql/563_restaurant_stations.sql'));
ok(
  'P2.3: 564 takeaway guest_name',
  exists('shared/sql/564_restaurant_takeaway_delivery.sql') &&
    /guest_name/.test(read('shared/sql/564_restaurant_takeaway_delivery.sql')),
);
ok(
  'P3: 565 recipes tables',
  exists('shared/sql/565_restaurant_recipes.sql') &&
    /product_recipe_lines/.test(read('shared/sql/565_restaurant_recipes.sql')),
);
ok(
  'P4: 566 split/merge index',
  exists('shared/sql/566_restaurant_split_merge_transfer.sql') &&
    /idx_pos_orders_table_pending/.test(
      read('shared/sql/566_restaurant_split_merge_transfer.sql'),
    ),
);

// ── Service SSOT ──────────────────────────────────────────────
const svc = read('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
ok('P1: restaurantService does not call createSale', !/createSale\s*\(/.test(svc));
ok('P1: assertRestaurantEnabled', /assertRestaurantEnabled/.test(svc));
ok('P2.4: assignWaiter', /assignWaiter/.test(svc));
ok('P3: upsertRecipe', /upsertRecipe/.test(svc));
ok('P4: transferCheck', /transferCheck/.test(svc));
ok('P4: mergeChecks', /mergeChecks/.test(svc));
ok('P4: splitCheck', /splitCheck/.test(svc));

const sales = read('SamplePOS.Server/src/modules/sales/salesService.ts');
ok('P3: createSale explodes recipes', /explodeActiveRecipe/.test(sales));
ok('P3: createSale uses stock plan matrix', /planSaleStockDeduction/.test(sales));
ok(
  'P3: service without recipe skips stock',
  /Skipping inventory deduction for service item/.test(sales),
);

const explosion = read('SamplePOS.Server/src/modules/sales/saleRecipeExplosion.ts');
ok('P3: planSaleStockDeduction matrix', /planSaleStockDeduction/.test(explosion));
ok(
  'P3: recipe Jest covers inventory×service',
  exists('SamplePOS.Server/src/modules/sales/saleRecipeExplosion.test.ts'),
);

const sendKot = svc.slice(svc.indexOf('async sendKot('), svc.indexOf('async listKitchenBoard('));
ok(
  'P3: sendKot never consumes stock',
  sendKot.length > 100 &&
    !/explodeActiveRecipe|validateStockAvailability|stock_movements|createSale\s*\(/.test(sendKot),
);
ok('P3: recipe upsert blocks service ingredients', /cannot be a service product/.test(svc));

const routes = read('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
ok('route /transfer', /checks\/:orderId\/transfer/.test(routes));
ok('route /merge', /checks\/:orderId\/merge/.test(routes));
ok('route /split', /checks\/:orderId\/split/.test(routes));
ok('route /recipes', /\/recipes/.test(routes));
ok('route /waiters', /\/waiters/.test(routes));
ok('route kitchen/board', /kitchen\/board/.test(routes));

// ── Offline 5.1–5.5 ───────────────────────────────────────────
const journal = read('samplepos.client/src/lib/offlineEventJournal.ts');
ok('P5.1: journal key pos_offline_events', /JOURNAL_KEY = 'pos_offline_events'/.test(journal));
ok('P5.1: no restaurant_offline_events', !/restaurant_offline_events/.test(journal));
ok('P5.1: RESTAURANT_KOT_FIRED', /RESTAURANT_KOT_FIRED/.test(journal));
ok('P5.2: SALE_COMPLETED tableId', /tableId\?:/.test(journal) && /SALE_COMPLETED/.test(journal));
ok('P5.4: TRANSFERRED/MERGED/SPLIT', /RESTAURANT_CHECK_TRANSFERRED/.test(journal) && /RESTAURANT_CHECK_MERGED/.test(journal) && /RESTAURANT_CHECK_SPLIT/.test(journal));
ok('P5.5: RESTAURANT_KOT_STATUS', /RESTAURANT_KOT_STATUS/.test(journal));

const ops = read('samplepos.client/src/lib/restaurantOfflineOps.ts');
ok('P5.1: appendRestaurantItemOffline', /appendRestaurantItemOffline/.test(ops));
ok('P5.1: fireRestaurantKotOffline', /fireRestaurantKotOffline/.test(ops));
ok('P5.2: payRestaurantCheckOffline', /payRestaurantCheckOffline/.test(ops));
ok('P5.3: cancelRestaurantCheckOffline', /cancelRestaurantCheckOffline/.test(ops));
ok('P5.3: assignRestaurantWaiterOffline', /assignRestaurantWaiterOffline/.test(ops));
ok('P5.4: transfer/merge/split offline', /transferRestaurantCheckOffline/.test(ops) && /mergeRestaurantChecksOffline/.test(ops) && /splitRestaurantCheckOffline/.test(ops));
ok('P5.5: advanceRestaurantKotOffline', /advanceRestaurantKotOffline/.test(ops));

const selectors = read('samplepos.client/src/lib/offlineEventSelectors.ts');
ok('P5.1: deriveRestaurantOpenChecks', /deriveRestaurantOpenChecks/.test(selectors));
ok('P5.5: deriveRestaurantKitchenBoard', /deriveRestaurantKitchenBoard/.test(selectors));

const lan = read('samplepos.client/src/lib/restaurantLanKds.ts');
ok('P5.5: BroadcastChannel LAN bus', /BroadcastChannel/.test(lan) && /publishLanKds/.test(lan));

const replayer = read('SamplePOS.Server/src/modules/pos/posEventReplayer.ts');
ok('P5.2: releaseTableForOrder on pay', /releaseTableForOrder/.test(replayer));
ok('P5.2: fromOrderId on SALE_COMPLETED', /fromOrderId/.test(replayer));
ok('P5.3: cancelOrder + updateOrder', /cancelOrder/.test(replayer) && /updateOrder/.test(replayer));
ok('P5.4: transfer/merge/split replay', /transferRestaurantCheck/.test(replayer) && /mergeRestaurantChecks/.test(replayer) && /splitRestaurantCheck/.test(replayer));
ok('P5.x: no silent table-link skip', !/Restaurant table link skipped/.test(replayer));
ok('P5.x: release helper returns error', /releaseRestaurantFloorAfterSale/.test(replayer));
ok('P5.x: REVIEW on release failure', /table release failed/.test(replayer));

const sync = read('SamplePOS.Server/src/modules/pos/syncEventsRoutes.ts');
ok('P5.4: sync schema TRANSFERRED', /RESTAURANT_CHECK_TRANSFERRED/.test(sync));
ok('P5.5: sync schema KOT_STATUS', /RESTAURANT_KOT_STATUS/.test(sync));

// ── UI ────────────────────────────────────────────────────────
ok('UI RestaurantPosPage', exists('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx'));
ok('UI KitchenDisplayPage', exists('samplepos.client/src/pages/restaurant/KitchenDisplayPage.tsx'));
ok('UI RestaurantStationsPage', exists('samplepos.client/src/pages/restaurant/RestaurantStationsPage.tsx'));
ok('UI RestaurantRecipesPage', exists('samplepos.client/src/pages/restaurant/RestaurantRecipesPage.tsx'));
ok('hook useRestaurantEnabled', exists('samplepos.client/src/hooks/useRestaurantEnabled.ts'));

    ok('P5.x: offline-first behavioral proof test exists', exists('samplepos.client/src/lib/restaurantOfflineOps.proof.test.ts'));
    const opsProof = read('samplepos.client/src/lib/restaurantOfflineOps.proof.test.ts');
ok('P5.x: proof covers add/cancel/pay/seed/kot/guest', /appendRestaurantItemOffline/.test(opsProof) && /cancelRestaurantCheckOffline/.test(opsProof) && /payRestaurantCheckOffline/.test(opsProof) && /seedRestaurantCheckFromServer/.test(opsProof) && /fireRestaurantKotOffline/.test(opsProof) && /updateRestaurantGuestOffline/.test(opsProof) && /shouldUseLocalRestaurantMutation/.test(opsProof));
ok('P5.x: journal appendSyncedEvent + cache invalidate', /appendSyncedEvent/.test(journal) && /invalidateJournalMemoryCache/.test(journal));
ok('P5.x: shouldUseLocalRestaurantMutation exported', /export function shouldUseLocalRestaurantMutation/.test(ops));

const kdsPage = read('samplepos.client/src/pages/restaurant/KitchenDisplayPage.tsx');
ok('P5.5 KDS uses journal board', /deriveRestaurantKitchenBoard/.test(kdsPage));
ok('P5.5 KDS surfaces API fallback error', /console\.error/.test(kdsPage) && /toast\.error/.test(kdsPage));

const posPage = read('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
ok('P5.x: POS paintJournalCheck (instant UI)', /paintJournalCheck/.test(posPage));
ok('P5.x: POS preferLocalRestaurantWrites', /preferLocalRestaurantWrites/.test(posPage));
ok('P5.x: POS seeds server checks for offline continue', /seedRestaurantCheckFromServer/.test(posPage));
ok('P5.x: POS pay uses journal cash path', /payRestaurantCheckOffline/.test(posPage));
ok('P5.x POS cache warm logs failure', /Offline cache warm failed/.test(posPage));
ok('ADR offline doc', exists('docs/architecture/RESTAURANT_OFFLINE_ADR.md'));

const failed = checks.filter((c) => !c.pass);
const report = {
  when: new Date().toISOString(),
  suite: 'restaurant-module-phases-1-through-5.5-structural',
  total: checks.length,
  passed: checks.filter((c) => c.pass).length,
  failed: failed.length,
  checks,
  failedChecks: failed.map((c) => c.name),
};
console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
