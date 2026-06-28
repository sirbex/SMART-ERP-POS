/**
 * AR (1200) reconciliation metrics — SSOT for lanes, integrity, and proof scripts.
 */
import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import {
  arMaterialityThreshold,
  computeArGlCustomerScope,
  computeArGlGrossPosted,
  computeArGlNetActive,
  computeArOpenItemSubledger,
  computeCustomersTableSum,
  computeUnallocatedArPayments,
  type ArQueryContext,
} from './arReconciliationEngine.js';

export interface ArReconciliationMetrics {
  asOfDate: string;
  glNetActive1200: number;
  glCustomerScopeNetActive: number;
  glGrossPosted1200: number;
  openItemSubledger: number;
  customersTableSum: number;
  storedBalance1200: number;
  customerCacheDrift: number;
  storedBalanceDrift: number;
  integrityGlDrift: number;
  unallocatedPayments: number;
}

type ArDb = Pool | PoolClient;

export async function captureArReconciliationMetrics(
  conn: ArDb,
  asOfDate?: string,
): Promise<ArReconciliationMetrics> {
  const date = asOfDate ?? new Date().toISOString().slice(0, 10);
  const ctx: ArQueryContext = { asOfDate: date };

  const storedRes = await conn.query(`
    SELECT COALESCE("CurrentBalance", 0) AS balance
    FROM accounts WHERE "AccountCode" = '1200'
  `);
  const storedBalance1200 = Money.toNumber(Money.parseDb(storedRes.rows[0]?.balance ?? 0));

  const [
    glNetActive1200,
    glCustomerScopeNetActive,
    glGrossPosted1200,
    openItemSubledger,
    customersTableSum,
    unallocatedPayments,
  ] = await Promise.all([
    computeArGlNetActive(conn, ctx),
    computeArGlCustomerScope(conn, ctx),
    computeArGlGrossPosted(conn, ctx),
    computeArOpenItemSubledger(conn, ctx),
    computeCustomersTableSum(conn),
    computeUnallocatedArPayments(conn, ctx),
  ]);

  return {
    asOfDate: date,
    glNetActive1200,
    glCustomerScopeNetActive,
    glGrossPosted1200,
    openItemSubledger,
    customersTableSum,
    storedBalance1200,
    customerCacheDrift: customersTableSum - openItemSubledger,
    storedBalanceDrift: glNetActive1200 - storedBalance1200,
    integrityGlDrift: glNetActive1200 - openItemSubledger,
    unallocatedPayments,
  };
}

export function isArGlIntegrityMatched(metrics: ArReconciliationMetrics): boolean {
  if (Math.abs(metrics.integrityGlDrift) <= 0.01) return true;
  return Math.abs(metrics.integrityGlDrift) <= arMaterialityThreshold(metrics.glNetActive1200);
}
