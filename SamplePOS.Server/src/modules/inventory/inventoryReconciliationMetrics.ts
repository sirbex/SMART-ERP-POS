/**
 * Inventory (1300) reconciliation metrics — SSOT for lanes, integrity, and proof scripts.
 */
import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import {
  computeBatchSubledger,
  computeGl1300GrossPosted,
  computeGl1300NetActive,
  computeProductValuationCache,
  computeStoredBalance1300,
  inventoryMaterialityThreshold,
  type InventoryQueryContext,
} from './inventoryReconciliationEngine.js';

export interface InventoryReconciliationMetrics {
  asOfDate: string;
  glNetActive1300: number;
  glGrossPosted1300: number;
  batchSubledger: number;
  productValuationCache: number;
  storedBalance1300: number;
  productCacheDrift: number;
  storedBalanceDrift: number;
  integrityGlDrift: number;
  materialityThreshold: number;
  reversalImpact: number;
}

type InventoryDb = Pool | PoolClient;

export async function captureInventoryReconciliationMetrics(
  conn: InventoryDb,
  asOfDate?: string,
): Promise<InventoryReconciliationMetrics> {
  const date = asOfDate ?? new Date().toISOString().slice(0, 10);
  const ctx: InventoryQueryContext = { asOfDate: date };

  const [
    glNetActive1300,
    glGrossPosted1300,
    batchSubledger,
    productValuationCache,
    storedBalance1300,
  ] = await Promise.all([
    computeGl1300NetActive(conn, ctx),
    computeGl1300GrossPosted(conn, ctx),
    computeBatchSubledger(conn),
    computeProductValuationCache(conn),
    computeStoredBalance1300(conn),
  ]);

  const materialityThreshold = inventoryMaterialityThreshold(glNetActive1300);

  return {
    asOfDate: date,
    glNetActive1300,
    glGrossPosted1300,
    batchSubledger,
    productValuationCache,
    storedBalance1300,
    productCacheDrift: batchSubledger - productValuationCache,
    storedBalanceDrift: glNetActive1300 - storedBalance1300,
    integrityGlDrift: glNetActive1300 - batchSubledger,
    materialityThreshold,
    reversalImpact: glGrossPosted1300 - glNetActive1300,
  };
}

export function isInventoryGlIntegrityMatched(metrics: InventoryReconciliationMetrics): boolean {
  if (Math.abs(metrics.integrityGlDrift) <= 0.01) return true;
  return Math.abs(metrics.integrityGlDrift) <= metrics.materialityThreshold;
}
