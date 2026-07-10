/**
 * Proof suite: inventory × supplier business-logic inconsistencies.
 *
 * Each test CONFIRMS a reported divergence still exists in source code.
 * PASS = inconsistency documented and verified (no remediation yet).
 * After a fix, update or remove the corresponding proof test.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  poItemNetReceivedQuantitySql,
  poItemReturnedQuantitySql,
} from '../modules/purchase-orders/purchaseOrderNetReceived.js';
import { AP_OPEN_INVOICE_GL_POSTED_SQL } from '../modules/supplier-payments/apReconciliationEngine.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function src(rel: string): string {
  const path = resolve(serverRoot, rel);
  if (!existsSync(path)) {
    throw new Error(`Source file not found for proof: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

function fnBody(source: string, fnName: string): string {
  const start = source.indexOf(`async ${fnName}(`);
  if (start < 0) {
    const alt = source.indexOf(`${fnName}(`);
    if (alt < 0) throw new Error(`Function ${fnName} not found`);
    const nextFn = source.indexOf('\n  async ', alt + 1);
    return nextFn > alt ? source.slice(alt, nextFn) : source.slice(alt);
  }
  const nextFn = source.indexOf('\n  async ', start + 1);
  return nextFn > start ? source.slice(start, nextFn) : source.slice(start);
}

describe('PROOF: Inventory × Supplier inconsistency audit', () => {
  describe('HIGH — GR net vs gross poAlreadyReceived', () => {
    it('H01: getGRById uses net-received SQL for poAlreadyReceived', () => {
      const repo = src('src/modules/goods-receipts/goodsReceiptRepository.ts');
      const getById = fnBody(repo, 'getGRById');
      expect(getById).toContain('poItemNetReceivedQuantitySql');
      expect(getById).toContain('as "poAlreadyReceived"');
      expect(getById).not.toMatch(
        /poAlreadyReceived[^]*COALESCE\(poi\.received_quantity,\s*0\)/,
      );
    });

    it('H02: getGRItemWithParent uses net-received SQL for poAlreadyReceived (parity with getGRById)', () => {
      const repo = src('src/modules/goods-receipts/goodsReceiptRepository.ts');
      const getItem = fnBody(repo, 'getGRItemWithParent');
      expect(getItem).toContain('poItemNetReceivedQuantitySql');
      expect(getItem).toContain('poItemReturnedQuantitySql');
      expect(getItem).toContain('as "poAlreadyReceived"');
      expect(getItem).not.toContain('COALESCE(poi.received_quantity, 0) as "poAlreadyReceived"');
    });

    it('H03: net and gross SQL diverge after returns (numeric scenario)', () => {
      const gross = 30;
      const returned = 5;
      const net = Math.max(0, gross - returned);
      expect(net).toBeLessThan(gross);
      expect(poItemNetReceivedQuantitySql('poi')).toContain('received_quantity');
      expect(poItemReturnedQuantitySql('poi')).toContain('return_grn');
    });
  });

  describe('HIGH — multistore adjustInventory gap', () => {
    it('H04: adjustBatch branches on isMultistoreEnabled', () => {
      const service = src('src/modules/inventory/inventoryService.ts');
      const adjustBatch = fnBody(service, 'adjustBatch');
      expect(adjustBatch).toContain('isMultistoreEnabled');
      expect(adjustBatch).toContain('warehouseAdjustmentService.adjustAtStore');
    });

    it('H05: adjustInventory branches on isMultistoreEnabled like adjustBatch', () => {
      const service = src('src/modules/inventory/inventoryService.ts');
      const adjustInventory = fnBody(service, 'adjustInventory');
      const adjustBatch = fnBody(service, 'adjustBatch');
      expect(adjustInventory).toContain('isMultistoreEnabled');
      expect(adjustInventory).toContain('warehouseAdjustmentService.adjustAtStore');
      expect(adjustBatch).toContain('warehouseAdjustmentService.adjustAtStore');
    });
  });

  describe('HIGH — quotation stock check vs sales', () => {
    it('H06: salesService branches stock validation on multistore', () => {
      const sales = src('src/modules/sales/salesService.ts');
      expect(sales).toContain('validateSellableAtStore');
      expect(sales).toContain('multistoreEnabled && sellingStoreId');
      expect(sales).toContain('InventoryBusinessRules.validateStockAvailability');
    });

    it('H07: quotationService branches stock validation on multistore like salesService', () => {
      const quote = src('src/modules/quotations/quotationService.ts');
      const sales = src('src/modules/sales/salesService.ts');
      expect(quote).toContain('validateSellableAtStore');
      expect(sales).toContain('validateSellableAtStore');
      const idx = quote.indexOf('validateSellableAtStore');
      expect(idx).toBeGreaterThan(-1);
      const window = quote.slice(idx - 200, idx + 400);
      expect(window).toContain('multistoreEnabled && sellingStoreId');
      expect(window).toContain('InventoryBusinessRules.validateStockAvailability');
    });
  });

  describe('HIGH — return eligibility vs multistore deduction', () => {
    it('H08: getReturnableItems uses warehouse-aware on-hand when multistore', () => {
      const repo = src('src/modules/return-grn/returnGrnRepository.ts');
      const getItems = fnBody(repo, 'getReturnableItems');
      expect(getItems).toContain('isMultistoreEnabled');
      expect(getItems).toContain('supplierReturnOnHandQuantityExpr');
      const sql = src('src/modules/return-grn/returnGrnReturnableSql.ts');
      expect(sql).toContain('inventory_balances');
      expect(sql).toContain('product_lots');
    });

    it('H09: warehouseSupplierReturnDeductionService deducts per-store inventory_balances', () => {
      const svc = src('src/modules/inventory/warehouse/warehouseSupplierReturnDeductionService.ts');
      expect(svc).toContain('inventory_balances');
      expect(svc).toMatch(/Insufficient warehouse stock for return/);
    });
  });

  describe('HIGH — broken suppliers.view permission', () => {
    it('H10: unbilled-grns route requires suppliers.read', () => {
      const routes = src('src/modules/supplier-payments/supplierPaymentRoutes.ts');
      expect(routes).toContain("requirePermission('suppliers.read')");
      const unbilled = routes.slice(
        routes.indexOf("'/invoices/unbilled-grns'"),
        routes.indexOf("'/invoices/unbilled-grns'") + 120,
      );
      expect(unbilled).toContain("requirePermission('suppliers.read')");
      expect(unbilled).not.toContain("requirePermission('suppliers.view')");
    });

    it('H11: RBAC defines suppliers.read but not suppliers.view', () => {
      const perms = src('src/rbac/permissions.ts');
      expect(perms).toContain("p('suppliers.read'");
      expect(perms).not.toContain("p('suppliers.view'");
    });
  });

  describe('HIGH — ledger routes ignore tenant pool', () => {
    it('H12: inventory ledger/reconciliation routes resolve tenant pool via ledgerPool', () => {
      const routes = src('src/modules/inventory/inventoryRoutes.ts');
      expect(routes).toContain('function ledgerPool(req: Request)');
      expect(routes).toContain('req.tenantPool || globalPool');
      const ledgerSection = routes.slice(routes.indexOf('// ── Inventory Ledger'));
      expect(ledgerSection).toContain('const pool = ledgerPool(req)');
      expect(ledgerSection).not.toContain('getProductLedger(globalPool');
      expect(ledgerSection).not.toContain('getReconciliation(globalPool');
      expect(ledgerSection).not.toContain('getDiscrepancies(globalPool');
    });
  });

  describe('MEDIUM — inventory financial / validation gaps', () => {
    it('M01: multistore DAMAGE quarantine is internal transfer + audit movement (no GL handler)', () => {
      const adj = src('src/modules/inventory/warehouse/warehouseAdjustmentService.ts');
      const body = fnBody(adj, 'adjustAtStore');
      const damageBlock = body.slice(
        body.indexOf("params.reason === 'DAMAGE'"),
        body.indexOf('await warehouseInventoryRepository.adjustSellableQuantity'),
      );
      expect(damageBlock).toContain('moveLotQuantityBetweenStores');
      expect(damageBlock).toContain('recordMovement');
      expect(damageBlock).toContain('internal quarantine transfer');
      expect(damageBlock).not.toContain('new StockMovementHandler');
      expect(body).toContain('quarantineStoreId');
    });

    it('M02: ADJUSTMENT_IN requires unitCost in StockMovementHandler (MDG-001b)', () => {
      const handler = src('src/modules/inventory/stockMovementHandler.ts');
      expect(handler).toContain('[MDG-001b] unitCost is required for ADJUSTMENT_IN');
    });

    it('M03: legacy adjustInventory passes unitCost on ADJUSTMENT_IN when valuation exists', () => {
      const service = src('src/modules/inventory/inventoryService.ts');
      const adjustInventory = fnBody(service, 'adjustInventory');
      expect(adjustInventory).toContain('resolvedUnitCost');
      expect(adjustInventory).toContain('product_valuation');
    });

    it('M04: legacy stock count reconcile resolves unitCost for ADJUSTMENT_IN', () => {
      const sc = src('src/modules/inventory/stockCountService.ts');
      const legacyBlock = sc.slice(sc.indexOf('// Legacy global batch reconciliation'));
      expect(legacyBlock).toContain("movementType: movementType as 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'");
      expect(legacyBlock).toContain('product_valuation');
      expect(legacyBlock).toContain('unitCost: resolvedUnitCost');
    });

    it('M05: allowNegativeAdjustments enforced on multistore stock count path', () => {
      const sc = src('src/modules/inventory/stockCountService.ts');
      expect(sc).toContain('allowNegativeAdjustments');
      const multistoreBlock = sc.slice(
        sc.indexOf('if (useStoreReconciliation)'),
        sc.indexOf('// Legacy global batch reconciliation'),
      );
      expect(multistoreBlock).toContain('warehouseAdjustmentService.adjustAtStore');
      expect(multistoreBlock).toContain('allowNegativeAdjustments');
      expect(multistoreBlock).toContain('inventory_balances');
    });

    it('M06: validateMaxStockLevel no-op is not invoked on GR draft', () => {
      const rules = src('src/middleware/businessRules.ts');
      const fn = fnBody(rules, 'validateMaxStockLevel');
      expect(fn).toContain('return;');
      const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
      expect(gr).not.toContain('validateMaxStockLevel');
    });

    it('M07: GR cost layer failure rolls back finalize', () => {
      const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
      expect(gr).toMatch(/Cost layer creation failed/);
      expect(gr).toContain('throw new ValidationError');
      expect(gr).not.toContain('Not throwing - cost layer failure');
    });
  });

  describe('MEDIUM — supplier policy gaps', () => {
    it('M08: supplier credit guard enforced on PO, GR, and AP post', () => {
      expect(existsSync(resolve(serverRoot, 'src/modules/suppliers/supplierCreditGuard.ts'))).toBe(true);
      const guard = src('src/modules/suppliers/supplierCreditGuard.ts');
      expect(guard).toContain('computeSupplierOpenItemBalance');
      expect(guard).toContain('CreditLimit');
      for (const mod of [
        'src/modules/purchase-orders/purchaseOrderService.ts',
        'src/modules/goods-receipts/goodsReceiptService.ts',
        'src/modules/supplier-payments/supplierPaymentService.ts',
      ]) {
        expect(src(mod)).toContain('assertSupplierCreditHeadroom');
      }
    });

    it('M09: submitPO re-validates supplier active status', () => {
      const po = src('src/modules/purchase-orders/purchaseOrderService.ts');
      const submit = fnBody(po, 'submitPO');
      expect(submit).toContain('validateSupplierExists');
      const send = fnBody(po, 'sendPOToSupplier');
      expect(send).toContain('validateSupplierExists');
    });

    it('M10: manual GR path validates supplier before auto PO', () => {
      const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
      const manualBlock = gr.slice(
        gr.indexOf('Creating manual PO for supplier'),
        gr.indexOf('createManualPO'),
      );
      expect(manualBlock).toContain('validateSupplierExists');
      expect(manualBlock).toContain('assertSupplierCreditHeadroom');
    });

    it('M11: getTotalOutstanding uses AP SSOT is_posted_to_gl filter', () => {
      const repo = src('src/modules/suppliers/supplierRepository.ts');
      const fn = fnBody(repo, 'getTotalOutstanding');
      expect(fn).toContain('AP_OPEN_INVOICE_GL_POSTED_SQL');
    });

    it('M12: disabled BR-PO-011/012 not invoked from purchaseOrderService', () => {
      const po = src('src/modules/purchase-orders/purchaseOrderService.ts');
      expect(po).not.toContain('validateLeadTime');
      expect(po).not.toContain('validateMinimumOrderValue');
      const rules = src('src/middleware/businessRules.ts');
      const fn = fnBody(rules, 'validateLeadTime');
      expect(fn).toContain('Lead time validation skipped');
    });
  });

  describe('LOW — structural / permission drift', () => {
    it('L01: dead supplierModule.ts removed; server mounts supplierRoutes', () => {
      expect(existsSync(resolve(serverRoot, 'src/modules/suppliers/supplierModule.ts'))).toBe(false);
      const server = src('src/server.ts');
      expect(server).toContain('supplierRoutes');
      expect(server).not.toContain('supplierModule');
    });

    it('L02: lot-based GRN uses LotService.receiveLot as authorized receipt path', () => {
      const handler = src('src/modules/inventory/stockMovementHandler.ts');
      expect(handler).toContain('goodsReceiptService.finalizeGR');
      const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
      expect(gr).toContain('lotService.receiveLot');
    });

    it('L03: supplier invoice list GET requires suppliers.read', () => {
      const routes = src('src/modules/supplier-payments/supplierPaymentRoutes.ts');
      expect(routes).toContain("router.use(authenticate)");
      const listBlock = routes.slice(
        routes.indexOf("'/invoices'"),
        routes.indexOf("'/invoices/unbilled-grns'"),
      );
      expect(listBlock).toContain("requirePermission('suppliers.read')");
      const unbilled = routes.slice(
        routes.indexOf("'/invoices/unbilled-grns'"),
        routes.indexOf("'/invoices/unbilled-grns'") + 120,
      );
      expect(unbilled).toContain("requirePermission('suppliers.read')");
    });

    it('L04: GR finalize and reverse-uninvoiced share purchasing.post permission', () => {
      const grRoutes = src('src/modules/goods-receipts/goodsReceiptRoutes.ts');
      const finalizeBlock = grRoutes.slice(
        grRoutes.indexOf("'/:id/finalize'"),
        grRoutes.indexOf("'/:id/items/:itemId'"),
      );
      expect(finalizeBlock).toContain("requirePermission('purchasing.post')");
      expect(grRoutes).toMatch(
        /goodsReceiptRoutes\.post\(\s*'\/:id\/reverse-uninvoiced'[\s\S]*?requirePermission\('purchasing\.post'\)/,
      );
      expect(grRoutes).not.toMatch(
        /goodsReceiptRoutes\.post\(\s*'\/:id\/reverse-uninvoiced'[\s\S]*?requirePermission\('inventory\.create'\)/,
      );
    });
  });
});
