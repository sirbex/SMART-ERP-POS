/**
 * Phase F0 — compare legacy reconciliation outputs with the Financial Lane Framework SSOT.
 */
import type { Pool, PoolClient } from 'pg';
import logger from '../../utils/logger.js';
import { getAllDomainSummaries } from './financialLaneService.js';
import { captureApReconciliationMetrics } from '../supplier-payments/apReconciliationMetrics.js';
import { captureArReconciliationMetrics } from '../customer-payments/arReconciliationMetrics.js';
import { captureInventoryReconciliationMetrics, isInventoryGlIntegrityMatched } from '../inventory/inventoryReconciliationMetrics.js';
import { isApSupplierGlIntegrityMatched } from '../supplier-payments/apReconciliationMetrics.js';
import { isArGlIntegrityMatched } from '../customer-payments/arReconciliationMetrics.js';
import type { FinancialDomain } from './types.js';

type Db = Pool | PoolClient;

export interface ParityMismatch {
  domain: FinancialDomain | 'summary';
  field: string;
  frameworkValue: number | string | boolean;
  legacyValue: number | string | boolean;
  tolerance?: number;
}

export interface ReconciliationParityReport {
  asOfDate: string;
  checkedAt: string;
  ok: boolean;
  mismatches: ParityMismatch[];
  frameworkDomains: string[];
}

const ACCOUNT_CODE_BY_NAME: Record<string, FinancialDomain | 'cash'> = {
  'Accounts Payable': 'ap',
  'Accounts Payable (2100)': 'ap',
  'Accounts Receivable': 'ar',
  'Accounts Receivable (1200)': 'ar',
  Inventory: 'inventory',
  'Inventory (1300)': 'inventory',
  Cash: 'cash',
  'Cash (1010)': 'cash',
};

function near(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= tolerance;
}

function statusFromFramework(domain: FinancialDomain, integrityDiff: number, matched: boolean): string {
  if (domain === 'inventory') {
    return matched ? 'MATCHED' : 'DISCREPANCY';
  }
  return matched ? 'MATCHED' : 'DISCREPANCY';
}

/** Compare fn_full_reconciliation_report rows against framework integrity lanes. */
export async function compareSqlSummaryToFramework(
  pool: Db,
  asOfDate: string,
): Promise<ReconciliationParityReport> {
  const checkedAt = new Date().toISOString();
  const mismatches: ParityMismatch[] = [];

  const [summaries, sqlRes] = await Promise.all([
    getAllDomainSummaries(pool, asOfDate),
    pool.query<{
      account_name: string;
      gl_balance: string;
      subledger_balance: string;
      difference: string;
      status: string;
    }>(
      `SELECT account_name, gl_balance, subledger_balance, difference, status
       FROM fn_full_reconciliation_report($1::DATE)`,
      [asOfDate],
    ),
  ]);

  const frameworkByDomain = new Map(summaries.map((s) => [s.domain, s]));
  const metrics = {
    ap: await captureApReconciliationMetrics(pool, asOfDate),
    ar: await captureArReconciliationMetrics(pool, asOfDate),
    inventory: await captureInventoryReconciliationMetrics(pool, asOfDate),
  };

  for (const row of sqlRes.rows) {
    const domain = ACCOUNT_CODE_BY_NAME[row.account_name];
    if (!domain || domain === 'cash') continue;

    const summary = frameworkByDomain.get(domain);
    const integrity = summary?.lanes.find((l) => l.lane === 'integrity');
    if (!integrity) continue;

    const sqlDiff = Number(row.difference || 0);
    const sqlStatus = row.status;
    const fwDiff = integrity.difference;
    const fwStatus = integrity.status === 'RECONCILED' ? 'MATCHED' : 'DISCREPANCY';

    if (!near(sqlDiff, fwDiff, domain === 'inventory' ? metrics.inventory.materialityThreshold : 0.02)) {
      mismatches.push({
        domain,
        field: 'integrityDifference',
        frameworkValue: fwDiff,
        legacyValue: sqlDiff,
        tolerance: domain === 'inventory' ? metrics.inventory.materialityThreshold : 0.02,
      });
    }

    if (sqlStatus !== fwStatus) {
      const matched =
        domain === 'ap'
          ? isApSupplierGlIntegrityMatched(metrics.ap)
          : domain === 'ar'
            ? isArGlIntegrityMatched(metrics.ar)
            : isInventoryGlIntegrityMatched(metrics.inventory);
      mismatches.push({
        domain,
        field: 'status',
        frameworkValue: statusFromFramework(domain, fwDiff, matched),
        legacyValue: sqlStatus,
      });
    }
  }

  const ok = mismatches.length === 0;
  if (!ok) {
    logger.warn('[LEGACY RECON] SQL summary parity mismatch vs framework', {
      asOfDate,
      mismatchCount: mismatches.length,
      mismatches,
    });
  } else {
    logger.info('[LEGACY RECON] SQL summary parity OK vs framework', { asOfDate });
  }

  return {
    asOfDate,
    checkedAt,
    ok,
    mismatches,
    frameworkDomains: summaries.map((s) => s.domain),
  };
}

export interface FrameworkBaselineLane {
  domain: FinancialDomain;
  lane: 'integrity' | 'cache' | 'history';
  leftAmount: number;
  rightAmount: number;
  difference: number;
  status: string;
  periodCloseBlocking: boolean;
  severity: string;
  materialityThreshold?: number;
}

/** Snapshot all framework lanes for proof scripts and CI baseline. */
export async function captureFrameworkBaseline(
  pool: Db,
  asOfDate: string,
): Promise<FrameworkBaselineLane[]> {
  const summaries = await getAllDomainSummaries(pool, asOfDate);
  const invMetrics = await captureInventoryReconciliationMetrics(pool, asOfDate);

  return summaries.flatMap((summary) =>
    summary.lanes.map((lane) => ({
      domain: summary.domain,
      lane: lane.lane,
      leftAmount: lane.leftAmount,
      rightAmount: lane.rightAmount,
      difference: lane.difference,
      status: lane.status,
      periodCloseBlocking: lane.periodCloseBlocking,
      severity: lane.severity,
      materialityThreshold:
        summary.domain === 'inventory' && lane.lane === 'integrity'
          ? invMetrics.materialityThreshold
          : undefined,
    })),
  );
}
