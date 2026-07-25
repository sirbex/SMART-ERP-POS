/**
 * Restaurant architecture proof — Phase 1 foundation
 * Ensures SSOT: pos_orders + createSale, flag-off default, no parallel sales engine.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Restaurant architecture proof (Phase 1)', () => {
  it('migration ships flag default FALSE and reuses pos_orders', () => {
    const sql = readRepo('shared/sql/560_restaurant_foundation.sql');
    expect(sql).toMatch(/restaurant_mode_enabled\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS restaurant_tables/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS restaurant_kot/i);
    expect(sql).toMatch(/ALTER TABLE pos_orders/i);
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS restaurant_orders/i);
    expect(sql).toMatch(/INTENTIONALLY NO PRICE COLUMNS/i);
  });

  it('settings helper defaults off when column missing', () => {
    const settings = readRepo(
      'SamplePOS.Server/src/modules/restaurant/restaurantSettings.ts',
    );
    expect(settings).toMatch(/isRestaurantModeEnabled/);
    expect(settings).toMatch(/tableHasColumn/);
    expect(settings).toMatch(/return false/);
  });

  it('mutating service asserts restaurant enabled', () => {
    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/assertRestaurantEnabled/);
    expect(service).toMatch(/ordersService\.createOrder/);
    expect(service).toMatch(/ForbiddenError|restaurant_mode_enabled/);
    expect(service).not.toMatch(/createSale\s*\(/);
  });

  it('KOT items have no price fields in repository insert', () => {
    const repo = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts');
    expect(repo).toMatch(/restaurant_kot_items/);
    expect(repo).toMatch(/product_name, quantity, line_notes/);
    expect(repo).not.toMatch(/INSERT INTO restaurant_kot_items[\s\S]*unit_price/i);
  });

  it('routes mount under /api/restaurant and expose enabled', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/\/enabled/);
    expect(routes).toMatch(/restaurant\.order/);
    expect(routes).toMatch(/checks\/:orderId\/kot/);

    const server = readRepo('SamplePOS.Server/src/server.ts');
    expect(server).toMatch(/\/api\/restaurant/);
    expect(server).toMatch(/restaurantRoutes/);
  });

  it('order complete/cancel release table hook exists', () => {
    const ordersRoutes = readRepo('SamplePOS.Server/src/modules/orders/ordersRoutes.ts');
    expect(ordersRoutes).toMatch(/releaseTableForOrder/);
  });

  it('restaurant cancel check uses orders SSOT', () => {
    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/cancelCheck/);
    expect(service).toMatch(/ordersService\.cancelOrder/);
    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/checks\/:orderId\/cancel/);
  });

  it('Phase 2.1 kitchen board + status advance exist', () => {
    const sql = readRepo('shared/sql/562_restaurant_kitchen_display.sql');
    expect(sql).toMatch(/restaurant_kot/);
    expect(sql).toMatch(/SENT.*PREPARING.*READY.*BUMPED/s);

    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/listKitchenBoard/);
    expect(service).toMatch(/advanceKotStatus/);
    expect(service).toMatch(/syncOrderKitchenStatusFromKots/);

    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/kitchen\/board/);
    expect(routes).toMatch(/kitchen\/tickets\/:kotId\/advance/);

    expect(
      existsSync(path.join(repoRoot, 'samplepos.client/src/pages/restaurant/KitchenDisplayPage.tsx')),
    ).toBe(true);
  });

  it('Phase 2.2 station registry routes KOT printers', () => {
    const sql = readRepo('shared/sql/563_restaurant_stations.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS restaurant_stations/i);
    expect(sql).toMatch(/printer_name/);

    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/resolveStation/);
    expect(service).toMatch(/listStations/);
    expect(service).toMatch(/printerName/);

    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/\/stations/);

    const print = readRepo('samplepos.client/src/lib/printRestaurant.ts');
    expect(print).toMatch(/X-Printer-Name/);

    expect(
      existsSync(path.join(repoRoot, 'samplepos.client/src/pages/restaurant/RestaurantStationsPage.tsx')),
    ).toBe(true);
  });

  it('Phase 2.3 takeaway/delivery guest details on checks', () => {
    const sql = readRepo('shared/sql/564_restaurant_takeaway_delivery.sql');
    expect(sql).toMatch(/guest_name/);
    expect(sql).toMatch(/delivery_address/);
    expect(sql).toMatch(/pickup_label/);

    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/updateCheckGuest/);
    expect(service).toMatch(/assertChannelGuest/);

    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/checks\/:orderId\/guest/);

    const print = readRepo('samplepos.client/src/lib/printRestaurant.ts');
    expect(print).toMatch(/TAKE AWAY|DELIVERY/);
    expect(print).toMatch(/guestName/);
  });

  it('Phase 2.4 waiter assignment uses pos_orders.waiter_id', () => {
    const foundation = readRepo('shared/sql/560_restaurant_foundation.sql');
    expect(foundation).toMatch(/waiter_id/);

    const repo = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts');
    expect(repo).toMatch(/listAssignableWaiters/);
    expect(repo).toMatch(/waiter_id/);

    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/assignWaiter/);
    expect(service).toMatch(/listAssignableWaiters/);

    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/\/waiters/);
    expect(routes).toMatch(/checks\/:orderId\/waiter/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/assignWaiter|listWaiters/);
    expect(pos).toMatch(/Waiter/);
  });

  it('Phase 3 recipes/BOM explode into createSale FEFO (not KOT)', () => {
    const sql = readRepo('shared/sql/565_restaurant_recipes.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS product_recipes/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS product_recipe_lines/i);
    expect(sql).toMatch(/quantity_base/);
    expect(sql).toMatch(/Deduction happens only in salesService\.createSale/);

    const explosion = readRepo('SamplePOS.Server/src/modules/sales/saleRecipeExplosion.ts');
    expect(explosion).toMatch(/explodeActiveRecipe/);
    expect(explosion).toMatch(/planSaleStockDeduction/);

    const sales = readRepo('SamplePOS.Server/src/modules/sales/salesService.ts');
    expect(sales).toMatch(/explodeActiveRecipe/);
    expect(sales).toMatch(/planSaleStockDeduction/);

    const restaurantService = readRepo(
      'SamplePOS.Server/src/modules/restaurant/restaurantService.ts',
    );
    expect(restaurantService).toMatch(/upsertRecipe/);
    expect(restaurantService).not.toMatch(/createSale\s*\(/);
    expect(restaurantService).toMatch(/cannot be a service product/);

    const sendKot = restaurantService.slice(
      restaurantService.indexOf('async sendKot('),
      restaurantService.indexOf('async listKitchenBoard('),
    );
    expect(sendKot).not.toMatch(/explodeActiveRecipe|validateStockAvailability|stock_movements/);

    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/\/recipes/);

    expect(
      existsSync(path.join(repoRoot, 'samplepos.client/src/pages/restaurant/RestaurantRecipesPage.tsx')),
    ).toBe(true);
  });

  it('Restaurant menu categories match category_id or free-text category', () => {
    const repo = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts');
    expect(repo).toMatch(/syncProductCategoryLinks/);
    expect(repo).toMatch(/LOWER\(TRIM\(p\.category\)\) = LOWER\(TRIM\(c\.name\)\)/);
    expect(repo).toMatch(/listMenuCategories/);

    const sql567 = readRepo('shared/sql/567_restaurant_menu_category_visibility.sql');
    expect(sql567).toMatch(/available_in_restaurant = TRUE/);
    expect(sql567).toMatch(/category_id = c\.id/);
  });

  it('Expert KOT flow: kitchen commit then return to floor; print is best-effort', () => {
    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    const sendKotHandler = pos.slice(
      pos.indexOf('const handleSendKot'),
      pos.indexOf('const handleBill'),
    );
    // Floor return is mandatory after successful fire (online + offline).
    expect(sendKotHandler).toMatch(/returnToFloor/);
    expect(sendKotHandler).toMatch(/api\.restaurant\.sendKot/);
    expect(sendKotHandler).toMatch(/fireRestaurantKotOffline/);
    // Empty / no-new-items still leaves the ticket (FOH close).
    expect(sendKotHandler).toMatch(/Nothing new for kitchen/);
    // Print failures must not abort the success path (no bare await print as sole post-commit gate).
    expect(sendKotHandler).toMatch(/printFailures|printOk/);
    expect(sendKotHandler).toMatch(/printKitchenTicket/);
    // createKot must resolve hasStatus before use (never ReferenceError on KOT fire).
    const repo = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts');
    const createKot = repo.slice(repo.indexOf('async createKot('), repo.indexOf('async getOrderRestaurantMeta('));
    expect(createKot).toMatch(/const hasStatus = await tableHasColumn/);

    const svc = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    const sendKot = svc.slice(svc.indexOf('async sendKot('), svc.indexOf('async voidCheckItems('));
    expect(sendKot).toMatch(/no unsent items/);
    expect(sendKot).not.toMatch(/ERR_RESTAURANT_KOT_EMPTY/);
  });

  it('Expert Bill flow: mark BILLING then return to floor; print is best-effort', () => {
    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    const billHandler = pos.slice(
      pos.indexOf('const handleBill'),
      pos.indexOf('const activateSibling'),
    );
    expect(billHandler).toMatch(/requestBill|markRestaurantBillRequestedOffline/);
    expect(billHandler).toMatch(/returnToFloor/);
    expect(billHandler).toMatch(/Bill requested/);
    expect(billHandler).toMatch(/printOk/);

    const svc = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(svc).toMatch(/async requestBill\(/);
    expect(svc).toMatch(/markBilling/);
    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/router\.post\(\s*'\/checks\/:orderId\/bill'/);
  });

  it('Restaurant POS buttons are touch-first (44px+ targets, touch-manipulation)', () => {
    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/touch-manipulation/);
    expect(pos).toMatch(/const touchBtn/);
    expect(pos).toMatch(/min-h-12/);
    expect(pos).toMatch(/min-h-14/);
    expect(pos).toMatch(/active:scale-\[0\.98\]/);
    // Phones: menu always on; Order/Details/More open as sheets on button press
    expect(pos).toMatch(/mobileSheet/);
    expect(pos).toMatch(/openMobileOrder/);
    expect(pos).not.toMatch(/max-h-\[52vh\]/);
    expect(pos).not.toMatch(/mobilePane/);
    // SambaPOS/Toast: consolidate identical lines + long-press / ··· line actions
    expect(pos).toMatch(/consolidateTicketLines/);
    expect(pos).toMatch(/startLineLongPress/);
    expect(pos).toMatch(/handleLinePlusOne/);
    expect(pos).toMatch(/handleLineMinusOne/);
  });

  it('Restaurant POS Pay is gated by restaurant.pay (cashier/accountant/admin)', () => {
    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/canRestaurantPay/);
    expect(pos).toMatch(/restaurant\.pay/);
    expect(pos).toMatch(/canRestaurantPay \? \(/);

    const grants = readRepo('shared/authorization/systemRoleGrants.ts');
    expect(grants).toMatch(/restaurant\.pay/);
    expect(grants).toMatch(/if \(permission\.key === 'restaurant\.pay'\) return false/);

    const sql568 = readRepo('shared/sql/568_restaurant_pay_role_scope.sql');
    expect(sql568).toMatch(/Accountant/);
    expect(sql568).toMatch(/Cashier/);
    expect(sql568).toMatch(/DELETE FROM rbac_role_permissions[\s\S]*Manager/s);
  });

  it('Restaurant void after KOT prints VOID tickets and removes lines', () => {
    const sql569 = readRepo('shared/sql/569_restaurant_kot_void.sql');
    expect(sql569).toMatch(/ticket_kind/);
    expect(sql569).toMatch(/FIRE.*VOID|VOID.*FIRE/s);

    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/async voidCheckItems\(/);
    expect(service).toMatch(/ticketKind: 'VOID'/);
    expect(service).toMatch(/cancelCheck[\s\S]*ticketKind: 'VOID'/s);

    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/checks\/:orderId\/void-items/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/handleVoidLines/);
    expect(pos).toMatch(/voidItems/);
    expect(pos).toMatch(/ticketKind: 'VOID'/);
    // New/unsent: cancel/remove without reason or VOID print; Void only after KOT.
    expect(pos).toMatch(/Removed before kitchen send/);
    expect(pos).toMatch(/Cancel reason is required when kitchen has been notified/);
    expect(pos).toMatch(/Remove \(not sent\)/);

    const print = readRepo('samplepos.client/src/lib/printRestaurant.ts');
    expect(print).toMatch(/STOP \/ DO NOT PREPARE|VOID/);
  });

  it('Phase 4 split/merge/transfer reuse pos_orders', () => {
    const sql = readRepo('shared/sql/566_restaurant_split_merge_transfer.sql');
    expect(sql).toMatch(/idx_pos_orders_table_pending/);

    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/transferCheck/);
    expect(service).toMatch(/mergeChecks/);
    expect(service).toMatch(/splitCheck/);
    expect(service).toMatch(/moveOrderItems|activateCheck/);
    expect(service).not.toMatch(/CREATE TABLE.*restaurant_orders/i);

    const repo = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts');
    expect(repo).toMatch(/moveOrderItems/);
    expect(repo).toMatch(/listPendingOrdersForTable/);

    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/checks\/:orderId\/transfer/);
    expect(routes).toMatch(/checks\/:orderId\/merge/);
    expect(routes).toMatch(/checks\/:orderId\/split/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/transferCheck|splitCheck|mergeChecks/);
  });

  it('Phase 5.1 restaurant offline uses existing event journal', () => {
    const journal = readRepo('samplepos.client/src/lib/offlineEventJournal.ts');
    expect(journal).toMatch(/RESTAURANT_KOT_FIRED/);
    expect(journal).toMatch(/JOURNAL_KEY = 'pos_offline_events'/);
    expect(journal).not.toMatch(/restaurant_offline_events/);

    const ops = readRepo('samplepos.client/src/lib/restaurantOfflineOps.ts');
    expect(ops).toMatch(/appendRestaurantItemOffline/);
    expect(ops).toMatch(/fireRestaurantKotOffline/);
    expect(ops).toMatch(/appendEvent/);

    const cache = readRepo('samplepos.client/src/lib/restaurantOfflineCache.ts');
    expect(cache).toMatch(/refreshRestaurantOfflineCache/);

    const selectors = readRepo('samplepos.client/src/lib/offlineEventSelectors.ts');
    expect(selectors).toMatch(/deriveRestaurantOpenChecks/);
    expect(selectors).toMatch(/deriveRestaurantCheckForTable/);

    const replayer = readRepo('SamplePOS.Server/src/modules/pos/posEventReplayer.ts');
    expect(replayer).toMatch(/RESTAURANT_KOT_FIRED/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/appendRestaurantItemOffline/);
    expect(pos).toMatch(/fireRestaurantKotOffline/);
    expect(pos).toMatch(/isOnline/);

    const adr = readRepo('docs/architecture/RESTAURANT_OFFLINE_ADR.md');
    expect(adr).toMatch(/Local First/);
  });

  it('Phase 5.2 offline cash pay uses SALE_COMPLETED + releases table on replay', () => {
    const ops = readRepo('samplepos.client/src/lib/restaurantOfflineOps.ts');
    expect(ops).toMatch(/payRestaurantCheckOffline/);
    expect(ops).toMatch(/SALE_COMPLETED/);
    expect(ops).not.toMatch(/createSale\(/);

    const journal = readRepo('samplepos.client/src/lib/offlineEventJournal.ts');
    expect(journal).toMatch(/tableId\?:/);

    const replayer = readRepo('SamplePOS.Server/src/modules/pos/posEventReplayer.ts');
    expect(replayer).toMatch(/releaseTableForOrder/);
    expect(replayer).toMatch(/fromOrderId/);

    const syncRoutes = readRepo('SamplePOS.Server/src/modules/pos/syncEventsRoutes.ts');
    expect(syncRoutes).toMatch(/RESTAURANT_KOT_FIRED/);
    expect(syncRoutes).toMatch(/tableId/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/payRestaurantCheckOffline/);
    expect(pos).toMatch(/OfflineSyncStatusPanel/);
    expect(pos).toMatch(/printReceipt/);
  });

  it('Phase 5.3 offline cancel, waiter assign, crash restore from journal', () => {
    const ops = readRepo('samplepos.client/src/lib/restaurantOfflineOps.ts');
    expect(ops).toMatch(/cancelRestaurantCheckOffline/);
    expect(ops).toMatch(/assignRestaurantWaiterOffline/);
    expect(ops).toMatch(/ORDER_CANCELLED/);

    const replayer = readRepo('SamplePOS.Server/src/modules/pos/posEventReplayer.ts');
    expect(replayer).toMatch(/updateOrder/);
    expect(replayer).toMatch(/cancelOrder/);
    expect(replayer).toMatch(/releaseTableForOrder/);
    expect(replayer).toMatch(/pos_orders/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/cancelRestaurantCheckOffline/);
    expect(pos).toMatch(/assignRestaurantWaiterOffline/);
    expect(pos).toMatch(/deriveRestaurantOpenChecks/);
    expect(pos).toMatch(/Restored .* open check/);
  });

  it('Phase 5.4 offline split/merge/transfer reuse journal + Phase 4 service', () => {
    const journal = readRepo('samplepos.client/src/lib/offlineEventJournal.ts');
    expect(journal).toMatch(/RESTAURANT_CHECK_TRANSFERRED/);
    expect(journal).toMatch(/RESTAURANT_CHECK_MERGED/);
    expect(journal).toMatch(/RESTAURANT_CHECK_SPLIT/);

    const ops = readRepo('samplepos.client/src/lib/restaurantOfflineOps.ts');
    expect(ops).toMatch(/transferRestaurantCheckOffline/);
    expect(ops).toMatch(/mergeRestaurantChecksOffline/);
    expect(ops).toMatch(/splitRestaurantCheckOffline/);

    const selectors = readRepo('samplepos.client/src/lib/offlineEventSelectors.ts');
    expect(selectors).toMatch(/RESTAURANT_CHECK_SPLIT/);
    expect(selectors).toMatch(/deriveRestaurantSiblingChecks/);

    const replayer = readRepo('SamplePOS.Server/src/modules/pos/posEventReplayer.ts');
    expect(replayer).toMatch(/transferRestaurantCheck/);
    expect(replayer).toMatch(/mergeRestaurantChecks/);
    expect(replayer).toMatch(/splitRestaurantCheck/);
    expect(replayer).toMatch(/transferCheck/);
    expect(replayer).toMatch(/mergeChecks/);
    expect(replayer).toMatch(/splitCheck/);

    const syncRoutes = readRepo('SamplePOS.Server/src/modules/pos/syncEventsRoutes.ts');
    expect(syncRoutes).toMatch(/RESTAURANT_CHECK_TRANSFERRED/);
    expect(syncRoutes).toMatch(/RESTAURANT_CHECK_MERGED/);
    expect(syncRoutes).toMatch(/RESTAURANT_CHECK_SPLIT/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/transferRestaurantCheckOffline/);
    expect(pos).toMatch(/mergeRestaurantChecksOffline/);
    expect(pos).toMatch(/splitRestaurantCheckOffline/);
  });

  it('Phase 5.5 LAN KDS uses journal board + BroadcastChannel (no cloud dependency)', () => {
    const journal = readRepo('samplepos.client/src/lib/offlineEventJournal.ts');
    expect(journal).toMatch(/RESTAURANT_KOT_STATUS/);

    const selectors = readRepo('samplepos.client/src/lib/offlineEventSelectors.ts');
    expect(selectors).toMatch(/deriveRestaurantKitchenBoard/);

    const lan = readRepo('samplepos.client/src/lib/restaurantLanKds.ts');
    expect(lan).toMatch(/BroadcastChannel/);
    expect(lan).toMatch(/publishLanKds/);

    const ops = readRepo('samplepos.client/src/lib/restaurantOfflineOps.ts');
    expect(ops).toMatch(/advanceRestaurantKotOffline/);
    expect(ops).toMatch(/publishLanKdsBoardChanged/);

    const kds = readRepo('samplepos.client/src/pages/restaurant/KitchenDisplayPage.tsx');
    expect(kds).toMatch(/deriveRestaurantKitchenBoard/);
    expect(kds).toMatch(/subscribeLanKds/);
    expect(kds).toMatch(/advanceRestaurantKotOffline/);
    expect(kds).toMatch(/isOnline/);

    const syncRoutes = readRepo('SamplePOS.Server/src/modules/pos/syncEventsRoutes.ts');
    expect(syncRoutes).toMatch(/RESTAURANT_KOT_STATUS/);

    const replayer = readRepo('SamplePOS.Server/src/modules/pos/posEventReplayer.ts');
    expect(replayer).toMatch(/RESTAURANT_KOT_STATUS/);
  });

  it('error integrity: restaurant sync failures surface REVIEW/FAILED (not swallowed)', () => {
    const replayer = readRepo('SamplePOS.Server/src/modules/pos/posEventReplayer.ts');
    expect(replayer).not.toMatch(/Restaurant table link skipped/);
    expect(replayer).toMatch(/Order created but restaurant table link failed/);
    expect(replayer).toMatch(/releaseRestaurantFloorAfterSale/);
    expect(replayer).toMatch(/table release failed/);
    expect(replayer).toMatch(/status: 'REVIEW'/);
    expect(replayer).toMatch(/status: 'FAILED'/);

    const kds = readRepo('samplepos.client/src/pages/restaurant/KitchenDisplayPage.tsx');
    expect(kds).toMatch(/console\.error/);
    expect(kds).toMatch(/toast\.error/);
    expect(kds).not.toMatch(/catch \{\s*\/\/ Fall back/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/Offline cache warm failed/);
  });

  it('system settings DTO includes restaurantModeEnabled', () => {
    const types = readRepo('shared/types/systemSettings.ts');
    expect(types).toMatch(/restaurantModeEnabled/);
    expect(types).toMatch(/restaurant_mode_enabled/);
  });

  it('module files exist', () => {
    for (const rel of [
      'SamplePOS.Server/src/modules/restaurant/restaurantSettings.ts',
      'SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts',
      'SamplePOS.Server/src/modules/restaurant/restaurantService.ts',
      'SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts',
      'samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx',
      'samplepos.client/src/hooks/useRestaurantEnabled.ts',
    ]) {
      expect(existsSync(path.join(repoRoot, rel))).toBe(true);
    }
  });
});
