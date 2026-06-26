/**
 * AP drift heal policy — blocks symptom-only GL adjustments; returns actionable decomposition.
 */
import type { Pool } from 'pg';
import {
  captureApReconciliationMetrics,
  type ApReconciliationMetrics,
} from './apReconciliationMetrics.js';
import {
  apMaterialityThreshold,
  computeApReconciliationSnapshot,
  isApDriftExplainedByExpenses,
  isApDriftExplainedByUnpostedInvoices,
} from './apReconciliationEngine.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';

export interface ApDriftHealAssessment {
  eligible: boolean;
  drift: number;
  reasons: string[];
  recommendations: string[];
  metrics: ApReconciliationMetrics;
  /** Per-supplier entity GL vs open-item (|drift| > 1000) */
  supplierDrifts: Array<{ supplier: string; drift: number }>;
  untaggedCorrectionNet2100: number;
  orphanReturnGrnOnAp: Array<{ returnGrnNumber: string; transactionNumber: string; apDebit: number }>;
}

export async function assessApDriftHealEligibility(pool: Pool): Promise<ApDriftHealAssessment> {
  const metrics = await captureApReconciliationMetrics(pool);
  const snapshot = await computeApReconciliationSnapshot(pool);
  const threshold = apMaterialityThreshold(snapshot.glBalance);
  const drift = metrics.integrityGlDrift;
  const reasons: string[] = [];
  const recommendations: string[] = [];

  if (Math.abs(drift) <= 0.01) {
    return {
      eligible: false,
      drift,
      reasons: ['No material AP integrity drift'],
      recommendations: [],
      metrics,
      supplierDrifts: [],
      untaggedCorrectionNet2100: 0,
      orphanReturnGrnOnAp: [],
    };
  }

  if (isApDriftExplainedByExpenses(snapshot, threshold)) {
    reasons.push(
      `Drift explained by ${metrics.expenseOnAp.toFixed(2)} standalone expense on 2100 (not supplier subledger)`,
    );
  }

  if (isApDriftExplainedByUnpostedInvoices(snapshot, threshold)) {
    reasons.push(
      `Drift matches unposted open invoices (${metrics.unpostedOpenInvoiceBalance.toFixed(2)}) — post bills to GL`,
    );
    recommendations.push('POST supplier invoices via 3-way match / postInvoiceToGL');
  }

  const untaggedRes = await pool.query<{ net: string }>(
    `
    SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS net
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."ReferenceType" = 'CORRECTION'
      AND ${LEDGER_NET_ACTIVE_SQL}
      AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'SUPPLIER')
    `,
  );
  const untaggedCorrectionNet2100 = Number(untaggedRes.rows[0]?.net ?? 0);
  if (Math.abs(untaggedCorrectionNet2100) > threshold) {
    reasons.push(
      `Untagged CORRECTION on 2100: ${untaggedCorrectionNet2100.toFixed(2)} — reverse mistaken heal-ap-drift entries`,
    );
    recommendations.push('POST /api/system/gl/reverse-transaction on TXN heal CORRECTION rows');
  }

  const supplierDriftsRes = await pool.query<{ supplier: string; drift: string }>(
    `
    WITH gl_by_supplier AS (
      SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS supplier_id,
             COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS gl_bal
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND le."EntityId" IS NOT NULL
        AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND ${LEDGER_NET_ACTIVE_SQL}
      GROUP BY le."EntityId"
    ),
    inv AS (
      SELECT si."SupplierId" AS supplier_id,
             COALESCE(SUM(
               CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
                 THEN -COALESCE(si."OutstandingBalance", 0)
                 ELSE COALESCE(si."OutstandingBalance", 0) END
             ), 0) AS inv_bal
      FROM supplier_invoices si
      WHERE si.deleted_at IS NULL
        AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        AND COALESCE(si.is_posted_to_gl, FALSE) = TRUE
      GROUP BY si."SupplierId"
    )
    SELECT s."CompanyName" AS supplier,
      (COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0))::numeric AS drift
    FROM suppliers s
    LEFT JOIN gl_by_supplier g ON g.supplier_id = s."Id"
    LEFT JOIN inv i ON i.supplier_id = s."Id"
    WHERE ABS(COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0)) > 1000
    ORDER BY ABS(COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0)) DESC
    `,
  );
  const supplierDrifts = supplierDriftsRes.rows.map((r) => ({
    supplier: r.supplier,
    drift: Number(r.drift),
  }));

  const orphanRgrnRes = await pool.query<{
    return_grn_number: string;
    transaction_number: string;
    ap_debit: string;
  }>(
    `
    SELECT r.return_grn_number,
      lt."TransactionNumber" AS transaction_number,
      (SUM(le."DebitAmount") - SUM(le."CreditAmount"))::numeric AS ap_debit
    FROM return_grn r
    JOIN ledger_transactions lt ON lt."ReferenceType" = 'RETURN_GRN' AND lt."ReferenceId" = r.id
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND ${LEDGER_NET_ACTIVE_SQL}
      AND NOT EXISTS (
        SELECT 1 FROM supplier_invoices si
        WHERE si.return_grn_id = r.id AND si.deleted_at IS NULL
      )
    GROUP BY r.id, r.return_grn_number, lt."Id", lt."TransactionNumber"
    HAVING SUM(le."DebitAmount") - SUM(le."CreditAmount") > 0.009
    `,
  );
  const orphanReturnGrnOnAp = orphanRgrnRes.rows.map((r) => ({
    returnGrnNumber: r.return_grn_number,
    transactionNumber: r.transaction_number,
    apDebit: Number(r.ap_debit),
  }));

  if (orphanReturnGrnOnAp.length > 0) {
    const sum = orphanReturnGrnOnAp.reduce((a, r) => a + r.apDebit, 0);
    reasons.push(
      `${orphanReturnGrnOnAp.length} RETURN_GRN(s) debited 2100 without SCN (total ${sum.toFixed(2)})`,
    );
    recommendations.push(
      'Reverse wrong RETURN_GRN GL, repost via 2160/2150, create Supplier Credit Notes',
    );
  }

  if (Math.abs(metrics.storedBalanceDrift) > 0.01) {
    recommendations.push('POST /api/system/gl/heal-ap-reconciliation-caches for STORED_BALANCE');
  }

  if (Math.abs(metrics.supplierCacheDrift) > 0.01) {
    recommendations.push('POST /api/system/gl/recalc-supplier-balances');
  }

  const explainedOnly =
    isApDriftExplainedByExpenses(snapshot, threshold) &&
    Math.abs(snapshot.residualAfterExpense) <= threshold;

  const eligible = false;

  if (!explainedOnly && reasons.length === 0) {
    reasons.push('Document-level fixes required before any GL adjustment');
    recommendations.push('Run proof-ap-drift-decompose.mjs for full breakdown');
  }

  recommendations.push(
    'Global heal-ap-drift CORRECTION is disabled — fix documents, not GL headline',
  );

  return {
    eligible,
    drift,
    reasons,
    recommendations,
    metrics,
    supplierDrifts,
    untaggedCorrectionNet2100,
    orphanReturnGrnOnAp,
  };
}
