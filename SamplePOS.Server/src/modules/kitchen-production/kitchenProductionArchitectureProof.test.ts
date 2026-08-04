/**
 * Kitchen Production architecture proof — ADR-005 Phase 1.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Kitchen Production architecture proof (Phase 1)', () => {
  it('ADR and roadmap exist', () => {
    expect(existsSync(path.join(repoRoot, 'docs/architecture/KITCHEN_PRODUCTION_ADR.md'))).toBe(
      true,
    );
    expect(
      existsSync(path.join(repoRoot, 'docs/architecture/KITCHEN_PRODUCTION_PHASE1_ROADMAP.md')),
    ).toBe(true);
    const adr = readRepo('docs/architecture/KITCHEN_PRODUCTION_ADR.md');
    expect(adr).toMatch(/additive and optional/i);
    expect(adr).toMatch(/COOK_TO_ORDER/);
    expect(adr).toMatch(/Inventory Engine/);
    expect(adr).not.toMatch(/replace sale-time recipe/i);
  });

  it('migration 587 ships flag default FALSE and production batch tables', () => {
    const sql = readRepo('shared/sql/587_kitchen_production_phase1.sql');
    expect(sql).toMatch(/kitchen_production_enabled\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS kitchen_production_documents/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS kitchen_production_component_lines/i);
    expect(sql).toMatch(/PRODUCTION_ISSUE/);
    expect(sql).toMatch(/PRODUCTION_RECEIPT/);
    expect(sql).toMatch(/kitchen\.production\.post/);
  });

  it('service posts via lots and does not call createSale', () => {
    const service = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenProductionService.ts',
    );
    expect(service).toMatch(/lotService\.consumeLot/);
    expect(service).toMatch(/lotService\.receiveLot/);
    expect(service).toMatch(/sourceType: 'PRODUCTION'/);
    expect(service).toMatch(/PRODUCTION_ISSUE/);
    expect(service).toMatch(/PRODUCTION_RECEIPT/);
    expect(service).toMatch(/explodeRecipeForProduction/);
    expect(service).not.toMatch(/createSale\s*\(/);
    expect(service).toMatch(/assertEnabled/);
  });

  it('Phase 2 prepared food catalog and recipe usage', () => {
    const sql = readRepo('shared/sql/588_kitchen_prepared_food_catalog.sql');
    expect(sql).toMatch(/is_prepared_food/);
    expect(sql).toMatch(/usage_mode/);
    expect(sql).toMatch(/AT_PRODUCTION/);

    const explode = readRepo('SamplePOS.Server/src/modules/sales/saleRecipeExplosion.ts');
    expect(explode).toMatch(/AT_SALE/);
    expect(explode).toMatch(/explodeRecipeForProduction/);

    const rules = readRepo('shared/utils/productTypeRules.ts');
    expect(rules).toMatch(/prepareFoodCatalogDefaults/);
    expect(rules).toMatch(/RecipeUsageMode/);
  });

  it('GL is material reclass INVENTORY_MOVE not COGS/expense', () => {
    const service = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenProductionService.ts',
    );
    expect(service).toMatch(/INVENTORY_MOVE/);
    expect(service).toMatch(/AccountCodes\.INVENTORY/);
    expect(service).not.toMatch(/AccountCodes\.COGS/);
    expect(service).not.toMatch(/SHRINKAGE/);
  });

  it('routes mount and permissions', () => {
    const routes = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenProductionRoutes.ts',
    );
    expect(routes).toMatch(/\/enabled/);
    expect(routes).toMatch(/\/batches/);
    expect(routes).toMatch(/kitchen\.production\.read/);
    expect(routes).toMatch(/kitchen\.production\.post/);

    const server = readRepo('SamplePOS.Server/src/server.ts');
    expect(server).toMatch(/\/api\/kitchen-production/);
    expect(server).toMatch(/kitchenProductionRoutes/);
  });

  it('cook-to-order path remains on salesService recipe explosion', () => {
    const explosion = readRepo('SamplePOS.Server/src/modules/sales/saleRecipeExplosion.ts');
    expect(explosion).toMatch(/never KOT/i);
    expect(explosion).toMatch(/explodeActiveRecipe/);
  });

  it('lot domain already allows PRODUCTION sourceType', () => {
    const lotTypes = readRepo('shared/inventory-lot/lotTypes.ts');
    expect(lotTypes).toMatch(/'PRODUCTION'/);
  });

  it('Phase 3 buffet sessions: capacity docs, sale hook, no plate BOM', () => {
    expect(
      existsSync(path.join(repoRoot, 'docs/architecture/KITCHEN_PRODUCTION_PHASE3_ROADMAP.md')),
    ).toBe(true);

    const sql = readRepo('shared/sql/589_kitchen_buffet_sessions.sql');
    expect(sql).toMatch(/is_buffet_cover/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS kitchen_buffet_sessions/i);
    expect(sql).toMatch(/kitchen_buffet_session_lines/);
    expect(sql).toMatch(/kitchen_buffet_cover_ledger/);
    expect(sql).toMatch(/Buffet is NOT a recipe/i);

    const routes = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenProductionRoutes.ts',
    );
    expect(routes).toMatch(/\/buffet-sessions/);
    expect(routes).toMatch(/buffetSessionService/);

    const service = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/buffetSessionService.ts',
    );
    expect(service).toMatch(/tryConsumeCoversForSale/);
    expect(service).toMatch(/coversAllowed/);
    expect(service).not.toMatch(/lotService\.consumeLot/);
    expect(service).not.toMatch(/createSale\s*\(/);

    const sales = readRepo('SamplePOS.Server/src/modules/sales/salesService.ts');
    expect(sales).toMatch(/tryConsumeCoversForSale/);
    expect(sales).toMatch(/buffetSessionService/);

    const clientApi = readRepo('samplepos.client/src/utils/api.ts');
    expect(clientApi).toMatch(/listBuffetSessions/);
    expect(clientApi).toMatch(/openBuffetSession/);

    const ui = readRepo('samplepos.client/src/pages/kitchen/KitchenBuffetSessionsPage.tsx');
    expect(ui).toMatch(/Buffet Sessions/);
    expect(ui).toMatch(/sold covers/i);
  });

  it('Phase 4 kitchen waste / yield posts via inventory loss path', () => {
    expect(
      existsSync(path.join(repoRoot, 'docs/architecture/KITCHEN_PRODUCTION_PHASE4_ROADMAP.md')),
    ).toBe(true);

    const sql = readRepo('shared/sql/590_kitchen_waste_yield.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS kitchen_waste_documents/i);
    expect(sql).toMatch(/kitchen_waste_lines/);
    expect(sql).toMatch(/WASTE_YIELD/);
    expect(sql).toMatch(/CLOSING/);
    expect(sql).toMatch(/buffet_session_id/);

    const service = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenWasteService.ts',
    );
    expect(service).toMatch(/lotService\.consumeLot/);
    expect(service).toMatch(/LOSS_DISPOSAL/);
    expect(service).toMatch(/KITCHEN_WASTE/);
    expect(service).toMatch(/AccountCodes\.INVENTORY/);
    expect(service).toMatch(/closeBuffetWithLeftovers/);
    expect(service).not.toMatch(/createSale\s*\(/);

    const routes = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenProductionRoutes.ts',
    );
    expect(routes).toMatch(/\/waste/);
    expect(routes).toMatch(/close-with-leftovers/);
    expect(routes).toMatch(/kitchenWasteService/);

    const wastePlan = readRepo('shared/kitchen-production/wastePlan.ts');
    expect(wastePlan).toMatch(/expenseAccountForKitchenWaste/);
    expect(wastePlan).toMatch(/lossExpenseReasonForKitchenWaste/);

    const clientApi = readRepo('samplepos.client/src/utils/api.ts');
    expect(clientApi).toMatch(/listWaste/);
    expect(clientApi).toMatch(/postWaste/);
    expect(clientApi).toMatch(/closeBuffetWithLeftovers/);

    const ui = readRepo('samplepos.client/src/pages/kitchen/KitchenWastePage.tsx');
    expect(ui).toMatch(/Kitchen Waste/);
  });

  it('Phase 5 food-cost analytics is read-only and ops-scoped', () => {
    expect(
      existsSync(path.join(repoRoot, 'docs/architecture/KITCHEN_PRODUCTION_PHASE5_ROADMAP.md')),
    ).toBe(true);

    const service = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenAnalyticsService.ts',
    );
    expect(service).toMatch(/productionVariance/);
    expect(service).toMatch(/buffetProfitability/);
    expect(service).toMatch(/foodCostPercent/);
    expect(service).toMatch(/not financial P&L/i);
    expect(service).not.toMatch(/lotService\.consumeLot/);
    expect(service).not.toMatch(/createSale\s*\(/);
    expect(service).not.toMatch(/AccountingCore\.createJournalEntry/);

    const routes = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenProductionRoutes.ts',
    );
    expect(routes).toMatch(/\/analytics\/summary/);
    expect(routes).toMatch(/\/analytics\/production-variance/);
    expect(routes).toMatch(/\/analytics\/waste/);
    expect(routes).toMatch(/\/analytics\/buffet/);
    expect(routes).toMatch(/kitchenAnalyticsService/);

    const plan = readRepo('shared/kitchen-production/analyticsPlan.ts');
    expect(plan).toMatch(/theoreticalLineCost/);
    expect(plan).toMatch(/foodCostPercent/);

    const clientApi = readRepo('samplepos.client/src/utils/api.ts');
    expect(clientApi).toMatch(/analyticsSummary/);
    expect(clientApi).toMatch(/analyticsBuffet/);

    const ui = readRepo('samplepos.client/src/pages/kitchen/KitchenAnalyticsPage.tsx');
    expect(ui).toMatch(/Kitchen Food Cost/);
    expect(ui).toMatch(/theoretical vs actual/i);
  });

  it('Phase 6 kitchen ops hub centralises one-shot business operations', () => {
    expect(
      existsSync(path.join(repoRoot, 'docs/architecture/KITCHEN_PRODUCTION_PHASE6_ROADMAP.md')),
    ).toBe(true);

    const ops = readRepo('SamplePOS.Server/src/modules/kitchen-production/kitchenOpsService.ts');
    expect(ops).toMatch(/quickProduce/);
    expect(ops).toMatch(/startService/);
    expect(ops).toMatch(/quickWaste/);
    expect(ops).toMatch(/endService/);
    expect(ops).toMatch(/getBoard/);
    expect(ops).toMatch(/recommendKitchenOpsAction/);
    expect(ops).not.toMatch(/createSale\s*\(/);

    const routes = readRepo(
      'SamplePOS.Server/src/modules/kitchen-production/kitchenProductionRoutes.ts',
    );
    expect(routes).toMatch(/\/ops\/board/);
    expect(routes).toMatch(/\/ops\/quick-produce/);
    expect(routes).toMatch(/\/ops\/start-service/);
    expect(routes).toMatch(/\/ops\/quick-waste/);
    expect(routes).toMatch(/\/ops\/end-service/);
    expect(routes).toMatch(/kitchenOpsService/);

    const plan = readRepo('shared/kitchen-production/opsPlan.ts');
    expect(plan).toMatch(/recommendKitchenOpsAction/);
    expect(plan).toMatch(/canQuickProduce/);
    expect(plan).toMatch(/START_SERVICE/);

    const clientApi = readRepo('samplepos.client/src/utils/api.ts');
    expect(clientApi).toMatch(/opsBoard/);
    expect(clientApi).toMatch(/quickProduce/);
    expect(clientApi).toMatch(/startService/);
    expect(clientApi).toMatch(/endService/);

    const ui = readRepo('samplepos.client/src/pages/kitchen/KitchenHubPage.tsx');
    expect(ui).toMatch(/Central ops board/i);
    expect(ui).toMatch(/Produce & receive stock/);
    expect(ui).toMatch(/Open service for POS/);

    const layout = readRepo('samplepos.client/src/components/Layout.tsx');
    expect(layout).toMatch(/path: '\/kitchen'/);
    expect(layout).toMatch(/name: 'Kitchen Production'/);
    expect(layout).toMatch(/name: 'Kitchen Display'/);
    expect(layout).toMatch(/path: '\/restaurant\/kitchen'/);
    // Must not show two identical "Kitchen" labels
    expect(layout.match(/name: 'Kitchen'/g) ?? []).toHaveLength(0);
  });

  it('live integrity proof + charter exist for rollout path', () => {
    expect(
      existsSync(path.join(repoRoot, 'docs/architecture/KITCHEN_PRODUCTION_PROOF_CHARTER.md')),
    ).toBe(true);
    const charter = readRepo('docs/architecture/KITCHEN_PRODUCTION_PROOF_CHARTER.md');
    expect(charter).toMatch(/KP-I-1/);
    expect(charter).toMatch(/produce FG/i);
    expect(charter).toMatch(/analytics KPIs/i);

    const live = readRepo('SamplePOS.Server/scripts/proof-kitchen-production-live.ts');
    expect(live).toMatch(/kitchen_production_enabled/);
    expect(live).toMatch(/AT_PRODUCTION/);
    expect(live).toMatch(/PRODUCTION_ISSUE/);
    expect(live).toMatch(/tryConsumeCoversForSale|sold_covers|cover-ledger|F-cover/);
    expect(live).toMatch(/closeBuffetWithLeftovers/);
    expect(live).toMatch(/kitchenAnalyticsService/);
    expect(live).toMatch(/LOSS_DISPOSAL/);

    const foundation = readRepo(
      'SamplePOS.Server/scripts/proof-kitchen-production-foundation.mjs',
    );
    expect(foundation).toMatch(/kitchen-production/);
    expect(foundation).toMatch(/proof-kitchen-production-live/);
  });
});
