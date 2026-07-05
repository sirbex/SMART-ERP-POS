/**
 * Phase 3 — supplier return on-hand SQL aligns eligibility with warehouse deduction.
 */
import { describe, it, expect } from '@jest/globals';
import {
  supplierReturnOnHandQuantityExpr,
  supplierReturnWarehouseBalanceSumSql,
  supplierReturnBatchOnHandSql,
} from './returnGrnReturnableSql.js';

describe('returnGrnReturnableSql (Phase 3)', () => {
  it('legacy on-hand uses batch remaining_quantity only', () => {
    const expr = supplierReturnOnHandQuantityExpr(false);
    expect(expr).toBe(supplierReturnBatchOnHandSql());
    expect(expr).toContain('ib.remaining_quantity');
    expect(expr).not.toContain('inventory_balances');
  });

  it('multistore on-hand caps batch by warehouse balance sum', () => {
    const expr = supplierReturnOnHandQuantityExpr(true);
    expect(expr).toContain('LEAST');
    expect(expr).toContain('ib.remaining_quantity');
    expect(expr).toContain('inventory_balances');
    expect(expr).toContain('product_lots');
    expect(expr).toContain(supplierReturnWarehouseBalanceSumSql());
  });

  it('warehouse balance subquery matches deduction service filters', () => {
    const sql = supplierReturnWarehouseBalanceSumSql();
    expect(sql).toContain('pl.inventory_batch_id = ib.id');
    expect(sql).toContain('pl.product_id = gri.product_id');
    expect(sql).toContain('quantity_on_hand > 0');
  });
});
