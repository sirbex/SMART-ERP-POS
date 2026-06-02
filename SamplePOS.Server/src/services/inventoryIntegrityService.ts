/**
 * Inventory Integrity Service
 *
 * SAP-inspired "Material Ledger Document Check" / Odoo stock valuation guard.
 *
 * PURPOSE:
 * After every inventory-affecting operation, verify that GL account 1300
 * (Inventory) stays in sync with the inventory valuation subledger (cost_layers).
 * If a discrepancy is detected, log a CRITICAL alert with root cause
 * so it can be surfaced to the tenant.
 *
 * DESIGN:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * - Every inventory operation (GR, Sale, Return, Adjustment) has a
 *   reference_type + reference_id in ledger_transactions.
 * - This service cross-checks: for each stock_movement, does a matching
 *   GL entry exist? And vice versa.
 * - Discrepancies are logged and made available via the reconciliation API.
 *
 * This is a READ-ONLY diagnostic service — it never mutates data.
 */

import type { Pool } from 'pg';
import logger from '../utils/logger.js';
import { Money } from '../utils/money.js';
import { getBusinessDate } from '../utils/dateRange.js';
import { ACTIVE_GL_REFERENCE_PREDICATE } from '../utils/activeGlReference.js';

/** Represents a single operation that may have a GL/subledger mismatch */
export interface IntegrityIssue {
    issueType: 'MISSING_GL' | 'MISSING_SUBLEDGER' | 'AMOUNT_MISMATCH' | 'ROUNDING_NOISE' | 'DUPLICATE_GL';
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    referenceType: string;
    referenceId: string;
    referenceNumber: string;
    description: string;
    glAmount: number;
    subledgerAmount: number;
    difference: number;
}

/** Full integrity report for a tenant's inventory */
export interface IntegrityReport {
    asOfDate: string;
    glBalance: number;
    batchValuation: number;
    netDifference: number;
    materialityThreshold: number;
    isWithinTolerance: boolean;
    issues: IntegrityIssue[];
    summary: string;
}

/**
 * Run a full inventory integrity check.
 *
 * Cross-references:
 * 1. GL entries on account 1300 (grouped by referenceType + referenceId)
 * 2. Stock movements (grouped by reference_type + reference_id)
 * 3. cost_layers current valuation
 *
 * Returns actionable diagnostics for every discrepancy found.
 */
export async function checkInventoryIntegrity(pool: Pool): Promise<IntegrityReport> {
    const asOfDate = getBusinessDate();
    const issues: IntegrityIssue[] = [];

    // 1. Get GL Inventory balance
    const glResult = await pool.query(`
        SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS balance
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        JOIN accounts a ON le."AccountId" = a."Id"
        WHERE a."AccountCode" = '1300'
          AND ${ACTIVE_GL_REFERENCE_PREDICATE}
    `);
    const glBalance = Money.toNumber(Money.parseDb(glResult.rows[0].balance));

    // 2. Get inventory valuation from remaining cost layers
    const batchResult = await pool.query(`
        SELECT COALESCE(SUM(remaining_quantity * unit_cost), 0) AS total
        FROM cost_layers
        WHERE remaining_quantity > 0
    `);
    const batchValuation = Money.toNumber(Money.parseDb(batchResult.rows[0].total));

    // 3. Materiality threshold (same as reconciliation function)
    const materialityThreshold = Math.max(5000, Math.abs(glBalance) * 0.0001);
    const netDifference = glBalance - batchValuation;
    const isWithinTolerance = Math.abs(netDifference) <= materialityThreshold;

    // 4. Find operations with GL entries but no stock movements (or vice versa)
    //    This catches: GR without GL, Sales with GL but missing COGS batch deduction, etc.

    // 4a. Inventory-affecting GL transactions that should have stock movements
    const glOps = await pool.query(`
        SELECT 
            lt."ReferenceType" AS ref_type,
            lt."ReferenceId" AS ref_id,
            lt."ReferenceNumber" AS ref_number,
            lt."Description" AS description,
            SUM(le."DebitAmount") AS debit_total,
            SUM(le."CreditAmount") AS credit_total
        FROM ledger_transactions lt
        JOIN ledger_entries le ON le."TransactionId" = lt."Id"
        JOIN accounts a ON le."AccountId" = a."Id"
        WHERE a."AccountCode" = '1300'
          AND ${ACTIVE_GL_REFERENCE_PREDICATE}
        GROUP BY lt."ReferenceType", lt."ReferenceId", lt."ReferenceNumber", lt."Description"
    `);

    // 4b. Stock movements grouped by reference
    const stockOps = await pool.query(`
        SELECT 
            reference_type AS ref_type,
            reference_id AS ref_id,
            SUM(ABS(quantity) * unit_cost) AS movement_value
        FROM stock_movements
        WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
        GROUP BY reference_type, reference_id
    `);
    const stockOpMap = new Map<string, number>();
    for (const row of stockOps.rows) {
        const key = `${row.ref_type}::${row.ref_id}`;
        stockOpMap.set(key, Money.toNumber(Money.parseDb(row.movement_value)));
    }

    // 4c. Map GL reference types to stock movement reference types
    const glToStockType: Record<string, string> = {
        'GOODS_RECEIPT': 'GOODS_RECEIPT',
        'SALE': 'SALE',
        'SALE_VOID': 'SALE_VOID',
        'SALE_REFUND': 'SALE_REFUND',
        'RETURN_GRN': 'RETURN_GRN',
        'STOCK_MOVEMENT': 'STOCK_ADJUSTMENT',
    };

    for (const row of glOps.rows) {
        const stockRefType = glToStockType[row.ref_type];
        if (!stockRefType) continue; // Non-inventory GL entries (e.g., opening stock)

        const key = `${stockRefType}::${row.ref_id}`;
        const stockValue = stockOpMap.get(key);
        const glNet = Money.toNumber(
            Money.subtract(Money.parseDb(row.debit_total), Money.parseDb(row.credit_total))
        );

        if (stockValue === undefined) {
            // GL entry exists but no stock movement — possible orphan
            issues.push({
                issueType: 'MISSING_SUBLEDGER',
                severity: 'WARNING',
                referenceType: row.ref_type,
                referenceId: row.ref_id,
                referenceNumber: row.ref_number || '',
                description: `GL entry for ${row.ref_type} ${row.ref_number || row.ref_id} has no matching stock movement`,
                glAmount: glNet,
                subledgerAmount: 0,
                difference: glNet,
            });
        }
    }

    // 4d. Check for stock movements WITHOUT matching GL entries
    //     These are guaranteed discrepancy sources (inventory moved, GL didn't)
    //     OPENING_BALANCE movements are excluded — their GL entries are posted
    //     under ReferenceType='OPENING_STOCK' keyed by individual movement ID,
    //     not by the parent GR reference_id.
    const unpostedOps = await pool.query(`
        SELECT 
            sm.reference_type,
            sm.reference_id,
            SUM(ABS(sm.quantity) * sm.unit_cost) AS movement_value,
            MIN(sm.created_at) AS first_seen
        FROM stock_movements sm
        WHERE sm.reference_type IN ('GOODS_RECEIPT', 'SALE', 'SALE_VOID', 'SALE_REFUND', 'RETURN_GRN')
          AND sm.reference_id IS NOT NULL
          AND sm.movement_type != 'OPENING_BALANCE'
          AND NOT EXISTS (
            SELECT 1 FROM ledger_transactions lt
            WHERE lt."ReferenceType" = sm.reference_type
              AND lt."ReferenceId" = sm.reference_id
              AND ${ACTIVE_GL_REFERENCE_PREDICATE}
          )
        GROUP BY sm.reference_type, sm.reference_id
    `);

    // 4e. Detect duplicate active GL docs for same business reference (SAP/Odoo anti-dup rule)
    const duplicateRefs = await pool.query(`
        SELECT
            lt."ReferenceType" AS reference_type,
            lt."ReferenceId" AS reference_id,
            MAX(lt."ReferenceNumber") AS reference_number,
            COUNT(*)::int AS txn_count,
            COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS net_1300
        FROM ledger_transactions lt
        JOIN ledger_entries le ON le."TransactionId" = lt."Id"
        JOIN accounts a ON a."Id" = le."AccountId"
        WHERE a."AccountCode" = '1300'
          AND lt."ReferenceType" IS NOT NULL
          AND lt."ReferenceId" IS NOT NULL
          AND ${ACTIVE_GL_REFERENCE_PREDICATE}
        GROUP BY lt."ReferenceType", lt."ReferenceId"
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC, ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
    `);

    for (const row of duplicateRefs.rows) {
        const net = Money.toNumber(Money.parseDb(row.net_1300));
        issues.push({
            issueType: 'DUPLICATE_GL',
            severity: 'CRITICAL',
            referenceType: row.reference_type,
            referenceId: row.reference_id,
            referenceNumber: row.reference_number || '',
            description:
                `Duplicate active GL postings for ${row.reference_type} ${row.reference_number || row.reference_id} ` +
                `(count=${row.txn_count})`,
            glAmount: net,
            subledgerAmount: 0,
            difference: net,
        });
    }

    for (const row of unpostedOps.rows) {
        const val = Money.toNumber(Money.parseDb(row.movement_value));
        if (val > 0) {
            issues.push({
                issueType: 'MISSING_GL',
                severity: 'CRITICAL',
                referenceType: row.reference_type,
                referenceId: row.reference_id,
                referenceNumber: '',
                description: `Stock movement (${row.reference_type}) has NO GL entry — inventory changed without accounting`,
                glAmount: 0,
                subledgerAmount: val,
                difference: -val,
            });
        }
    }

    // Sort: CRITICAL first, then by absolute difference descending
    issues.sort((a, b) => {
        if (a.severity !== b.severity) {
            const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
            return order[a.severity] - order[b.severity];
        }
        return Math.abs(b.difference) - Math.abs(a.difference);
    });

    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const duplicateCount = issues.filter(i => i.issueType === 'DUPLICATE_GL').length;
    const summary = isWithinTolerance && criticalCount === 0
        ? `Inventory integrity OK — GL and subledger within tolerance (${materialityThreshold.toLocaleString()} UGX)`
        : duplicateCount > 0
            ? `${duplicateCount} duplicate active GL reference(s) detected — remediation required before heal`
        : criticalCount > 0
            ? `${criticalCount} CRITICAL issue(s) found — stock movements without GL entries`
            : `GL-subledger difference (${Math.abs(netDifference).toLocaleString()}) exceeds tolerance (${materialityThreshold.toLocaleString()})`;

    if (criticalCount > 0) {
        logger.error('INVENTORY INTEGRITY ALERT — unposted stock movements detected', {
            criticalCount,
            issues: issues.filter(i => i.severity === 'CRITICAL'),
        });
    }

    return {
        asOfDate,
        glBalance,
        batchValuation,
        netDifference,
        materialityThreshold,
        isWithinTolerance: isWithinTolerance && criticalCount === 0,
        issues,
        summary,
    };
}
