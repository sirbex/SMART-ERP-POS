/**
 * Account Reconciliation Service
 *
 * ERP-grade account reconciliation with Clean Core principles:
 *   ✔ Compares GL balance with subledger balances
 *   ✔ Detects mismatches without auto-fixing
 *   ✔ Provides auditable, explainable output
 *   ✔ All data from database functions (no frontend calculations)
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import logger from '../utils/logger.js';
import { checkInventoryIntegrity, type IntegrityIssue } from './inventoryIntegrityService.js';
import { getBusinessDate } from '../utils/dateRange.js';
import { healApCachesIfDrifted } from '../modules/supplier-payments/apBalanceGovernance.js';
import {
  captureApReconciliationMetrics,
  isApSupplierGlIntegrityMatched,
} from '../modules/supplier-payments/apReconciliationMetrics.js';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// =============================================================================
// TYPES
// =============================================================================

export interface ReconciliationItem {
    source: string;
    description: string;
    amount: number;
    difference: number;
    status: 'BASE' | 'MATCHED' | 'DISCREPANCY' | 'ACTION_REQUIRED' | 'INFO';
    details?: unknown;
}

export interface ReconciliationReport {
    accountName: string;
    accountCode: string;
    asOfDate: string;
    generatedAt: string;
    glBalance: number;
    subledgerBalance: number;
    difference: number;
    status: 'RECONCILED' | 'DISCREPANCY';
    items: ReconciliationItem[];
    recommendations: string[];
    /** SAP-style integrity diagnostics: operations that caused the gap */
    integrityIssues?: IntegrityIssue[];
    /** Human-readable summary of integrity check */
    integritySummary?: string;
}

export interface FullReconciliationSummary {
    asOfDate: string;
    generatedAt: string;
    accounts: Array<{
        accountName: string;
        glBalance: number;
        subledgerBalance: number;
        difference: number;
        status: 'MATCHED' | 'DISCREPANCY';
        recommendation: string;
    }>;
    overallStatus: 'ALL_RECONCILED' | 'HAS_DISCREPANCIES';
    discrepancyCount: number;
}

// =============================================================================
// RECONCILIATION SERVICE
// =============================================================================

export class ReconciliationService {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    /**
     * Reconcile Cash Account (1010)
     *
     * Compares GL balance with cash payments
     */
    async reconcileCash(asOfDate?: string): Promise<ReconciliationReport> {
        const date = asOfDate || getBusinessDate();

        try {
            const result = await this.pool.query(
                `
                SELECT * FROM fn_reconcile_cash_account($1::DATE)
            `,
                [date]
            );

            const items: ReconciliationItem[] = result.rows.map((row) => ({
                source: row.source,
                description: row.description,
                amount: parseFloat(row.amount || '0'),
                difference: parseFloat(row.difference || '0'),
                status: row.status as ReconciliationItem['status'],
            }));

            const glBalance = items.find((i) => i.source === 'GL_BALANCE')?.amount || 0;
            const storedBalance = items.find((i) => i.source === 'STORED_BALANCE')?.amount ?? glBalance;
            const storedDiff = new Decimal(glBalance).minus(storedBalance).toNumber();

            // Only DISCREPANCY/ACTION_REQUIRED items (not INFO) affect reconciliation status.
            // Cash has no subledger — INFO items are breakdowns only.
            const hasDiscrepancy = items.some(
                (i) =>
                    (i.status === 'DISCREPANCY' || i.status === 'ACTION_REQUIRED') &&
                    i.source !== 'GL_BALANCE'
            );

            const recommendations: string[] = [];
            if (hasDiscrepancy) {
                recommendations.push('Review all cash transactions for the period');
                recommendations.push('Verify no manual cash adjustments were made outside the system');
                recommendations.push('Check for unreported cash receipts or payments');
                if (Math.abs(storedDiff) > 1) {
                    recommendations.push(
                        'accounts.CurrentBalance for 1010 has drifted from the computed GL — run a balance resync'
                    );
                }
            }

            return {
                accountName: 'Cash',
                accountCode: '1010',
                asOfDate: date,
                generatedAt: new Date().toISOString(),
                // Cash has no subledger; GL is the source of truth.
                // subledgerBalance = storedBalance so the header diff reflects any cache drift.
                glBalance,
                subledgerBalance: storedBalance,
                difference: storedDiff,
                status: hasDiscrepancy ? 'DISCREPANCY' : 'RECONCILED',
                items,
                recommendations,
            };
        } catch (error: unknown) {
            logger.error('Cash reconciliation failed', { asOfDate: date, error });
            throw error;
        }
    }

    /**
     * Reconcile Accounts Receivable (1200)
     *
     * Compares GL balance with customer balances and invoice balances
     */
    async reconcileAccountsReceivable(asOfDate?: string): Promise<ReconciliationReport> {
        const date = asOfDate || getBusinessDate();

        try {
            const result = await this.pool.query(
                `
                SELECT * FROM fn_reconcile_accounts_receivable($1::DATE)
            `,
                [date]
            );

            const items: ReconciliationItem[] = result.rows.map((row) => ({
                source: row.source,
                description: row.description,
                amount: parseFloat(row.amount || '0'),
                difference: parseFloat(row.difference || '0'),
                status: row.status as ReconciliationItem['status'],
                details: row.details,
            }));

            const glBalance = items.find((i) => i.source === 'GL_AR_BALANCE')?.amount || 0;
            const invoiceBalance = items.find((i) => i.source === 'INVOICE_BALANCE')?.amount || 0;
            const difference = new Decimal(glBalance).minus(invoiceBalance).toNumber();
            const hasDiscrepancy = items.some((i) => i.status === 'DISCREPANCY');

            const recommendations: string[] = [];
            if (hasDiscrepancy) {
                recommendations.push('Review customer payment applications');
                recommendations.push('Check for unapplied customer payments');
                recommendations.push('Verify invoice status updates are syncing to GL');
                recommendations.push('Investigate customers with balance discrepancies (see details)');
            }

            return {
                accountName: 'Accounts Receivable',
                accountCode: '1200',
                asOfDate: date,
                generatedAt: new Date().toISOString(),
                glBalance,
                subledgerBalance: invoiceBalance,
                difference,
                status: hasDiscrepancy ? 'DISCREPANCY' : 'RECONCILED',
                items,
                recommendations,
            };
        } catch (error: unknown) {
            logger.error('AR reconciliation failed', { asOfDate: date, error });
            throw error;
        }
    }

    /**
     * Reconcile Inventory (1300)
     *
     * Compares GL balance with inventory valuation (products and batches)
     */
    async reconcileInventory(asOfDate?: string): Promise<ReconciliationReport> {
        const date = asOfDate || getBusinessDate();

        try {
            const result = await this.pool.query(
                `
                SELECT * FROM fn_reconcile_inventory($1::DATE)
            `,
                [date]
            );

            const items: ReconciliationItem[] = result.rows.map((row) => ({
                source: row.source,
                description: row.description,
                amount: parseFloat(row.amount || '0'),
                difference: parseFloat(row.difference || '0'),
                status: row.status as ReconciliationItem['status'],
                details: row.details,
            }));

            const glBalance = items.find((i) => i.source === 'GL_INVENTORY_BALANCE')?.amount || 0;
            const batchValue = items.find((i) => i.source === 'BATCH_VALUATION')?.amount || 0;
            const productValue = items.find((i) => i.source === 'PRODUCT_VALUATION')?.amount || 0;

            // inventory_batches (FEFO) is the canonical subledger because:
            // - GL COGS is posted using FEFO batch.cost_price (not products.cost_price)
            // - Product cost_price is updated on new GRs but does NOT retroactively
            //   update existing batch costs, so product valuation diverges over time.
            // - All three integrity services (glValidationService, financialIntegrityService,
            //   inventoryGLIntegrityCheckService) use inventory_batches as the source of truth.
            // Product valuation is informational only.
            const subledgerBalance = batchValue > 0 ? batchValue : productValue;
            const difference = new Decimal(glBalance).minus(subledgerBalance).toNumber();
            // Materiality threshold: GREATEST(5000, 0.01% of GL) — consistent with
            // inventoryGLIntegrityCheckService and the BATCH_VALUATION row in fn_reconcile_inventory.
            const materialityThreshold = Math.max(5000, Math.abs(glBalance) * 0.0001);
            const hasDiscrepancy = Math.abs(difference) > materialityThreshold;

            // Run integrity diagnostics (SAP Material Ledger Document Check)
            let integrityIssues: IntegrityIssue[] | undefined;
            let integritySummary: string | undefined;
            try {
                const integrity = await checkInventoryIntegrity(this.pool);
                if (integrity.issues.length > 0) {
                    integrityIssues = integrity.issues;
                    integritySummary = integrity.summary;
                }
                // If integrity found critical issues, override status to DISCREPANCY
                const criticalCount = integrity.issues.filter(i => i.severity === 'CRITICAL').length;
                if (criticalCount > 0 && !hasDiscrepancy) {
                    // Force discrepancy flag when orphan operations detected
                    return {
                        accountName: 'Inventory',
                        accountCode: '1300',
                        asOfDate: date,
                        generatedAt: new Date().toISOString(),
                        glBalance,
                        subledgerBalance,
                        difference,
                        status: 'DISCREPANCY' as const,
                        items,
                        recommendations: [
                            `${criticalCount} operation(s) moved inventory without GL posting`,
                            ...integrity.issues
                                .filter(i => i.severity === 'CRITICAL')
                                .map(i => `${i.referenceType} ${i.referenceNumber || i.referenceId}: ${i.description}`),
                        ],
                        integrityIssues,
                        integritySummary,
                    };
                }
            } catch (integrityError: unknown) {
                logger.warn('Integrity check failed (non-fatal)', {
                    error: integrityError instanceof Error ? integrityError.message : String(integrityError),
                });
            }

            const recommendations: string[] = [];
            if (hasDiscrepancy) {
                recommendations.push('Review inventory adjustments and stock movements');
                recommendations.push('Verify goods receipt postings are complete');
                recommendations.push('Check for missing COGS entries on sales');
                recommendations.push('Perform physical inventory count if discrepancy persists');
            }

            return {
                accountName: 'Inventory',
                accountCode: '1300',
                asOfDate: date,
                generatedAt: new Date().toISOString(),
                glBalance,
                subledgerBalance,
                difference,
                status: hasDiscrepancy ? 'DISCREPANCY' : 'RECONCILED',
                items,
                recommendations,
                integrityIssues,
                integritySummary,
            };
        } catch (error: unknown) {
            logger.error('Inventory reconciliation failed', { asOfDate: date, error });
            throw error;
        }
    }

    /**
     * Reconcile Accounts Payable (2100)
     *
     * Compares GL balance with supplier outstanding balances
     */
    async reconcileAccountsPayable(asOfDate?: string): Promise<ReconciliationReport> {
        const date = asOfDate || getBusinessDate();

        try {
            // Auto-heal cache layers (STORED + SUPPLIER_BALANCE) before reporting.
            await healApCachesIfDrifted(this.pool);

            const m = await captureApReconciliationMetrics(this.pool, date);
            const glBalance = m.glTotal2100;
            const supplierEntityGl = m.glSupplierEntity2100;
            const supplierScopeGl = m.glSupplierScopeNetActive;
            const openItemSubledger = m.openItemSubledger;
            const supplierTableBalance = m.suppliersTableSum;
            const suppliersCacheExpected = m.suppliersCacheExpectedSum;
            const storedBalance = m.storedBalance2100;
            const expenseAccruals = m.expenseOnAp;
            const supplierGlIntegrityOk = isApSupplierGlIntegrityMatched(m);

            const items: ReconciliationItem[] = [
                {
                    source: 'GL_AP_BALANCE',
                    description:
                        `Accounts Payable (2100) net-active GL balance as of ${date}`,
                    amount: glBalance,
                    difference: 0,
                    status: 'BASE' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'NON_SUPPLIER_AP',
                    description:
                        'Non-supplier AP on 2100 (expense accruals — excluded from supplier subledger)',
                    amount: expenseAccruals,
                    difference: 0,
                    status: 'INFO' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'UNALLOCATED_PREPAYMENTS',
                    description:
                        'Completed supplier payments not yet allocated to invoices (reduces open-item subledger)',
                    amount: m.unallocatedPayments,
                    difference: 0,
                    status: 'INFO' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'UNPOSTED_PIPELINE',
                    description:
                        'Open supplier invoices not yet posted to GL (excluded from subledger; post bills to clear)',
                    amount: m.unpostedOpenInvoiceBalance,
                    difference: 0,
                    status: 'INFO' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'OPEN_ITEM_SUBLEDGER',
                    description:
                        'Open-item AP subledger (ledger-derived posted invoices − unallocated payments) as of '
                        + date,
                    amount: openItemSubledger,
                    difference: 0,
                    status: 'BASE' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'SUPPLIER_AP_GL',
                    description:
                        'Supplier AP GL (net-active supplier scope on 2100, as of '
                        + date
                        + ') vs open-item subledger',
                    amount: supplierScopeGl,
                    difference: m.integrityGlDrift,
                    status: supplierGlIntegrityOk
                        ? ('MATCHED' as ReconciliationItem['status'])
                        : ('DISCREPANCY' as ReconciliationItem['status']),
                    details: {
                        entityTypeSupplierGl: supplierEntityGl,
                        entityTypeDrift: m.supplierEntityGlDrift,
                        unallocatedPayments: m.unallocatedPayments,
                        unpostedOpenInvoiceBalance: m.unpostedOpenInvoiceBalance,
                    },
                },
                {
                    source: 'SUPPLIER_BALANCE',
                    description: 'Sum of per-supplier outstanding balances (suppliers table cache)',
                    amount: supplierTableBalance,
                    difference: m.supplierCacheDrift,
                    status:
                        Math.abs(m.supplierCacheDrift) < 0.01
                            ? ('MATCHED' as ReconciliationItem['status'])
                            : ('DISCREPANCY' as ReconciliationItem['status']),
                    details: null,
                },
                {
                    source: 'STORED_BALANCE',
                    description: 'Account CurrentBalance stored on accounts table',
                    amount: storedBalance,
                    difference: m.storedBalanceDrift,
                    status:
                        Math.abs(m.storedBalanceDrift) < 0.01
                            ? ('MATCHED' as ReconciliationItem['status'])
                            : ('DISCREPANCY' as ReconciliationItem['status']),
                    details: null,
                },
            ];

            const hasDiscrepancy = items.some((i) => i.status === 'DISCREPANCY');

            const recommendations: string[] = [];
            if (hasDiscrepancy) {
                if (Math.abs(m.storedBalanceDrift) > 0.01 || Math.abs(m.supplierCacheDrift) > 0.01) {
                    recommendations.push(
                        'Cache drift persists — POST /api/system/gl/heal-ap-reconciliation-caches or retry after deploy',
                    );
                }
                if (!supplierGlIntegrityOk) {
                    recommendations.push(
                        'SUPPLIER_AP_GL: POST /api/system/gl/heal-ap-drift if drift not explained by expense-on-AP',
                    );
                    recommendations.push('Run entity-tag backfill via heal-ap-reconciliation-caches');
                }
                recommendations.push('Review supplier payment applications and unallocated payments');
            }

            return {
                accountName: 'Accounts Payable',
                accountCode: '2100',
                asOfDate: date,
                generatedAt: new Date().toISOString(),
                glBalance: supplierScopeGl,
                subledgerBalance: openItemSubledger,
                difference: m.integrityGlDrift,
                status: hasDiscrepancy ? 'DISCREPANCY' : 'RECONCILED',
                items,
                recommendations,
            };
        } catch (error: unknown) {
            logger.error('AP reconciliation failed', { asOfDate: date, error });
            throw error;
        }
    }

    /**
     * Get Full Reconciliation Summary
     *
     * Runs all reconciliations and returns a summary
     */
    async getFullReconciliation(asOfDate?: string): Promise<FullReconciliationSummary> {
        const date = asOfDate || getBusinessDate();

        try {
            const result = await this.pool.query(
                `
                SELECT * FROM fn_full_reconciliation_report($1::DATE)
            `,
                [date]
            );

            const accounts = result.rows.map((row) => ({
                accountName: row.account_name,
                glBalance: parseFloat(row.gl_balance || '0'),
                subledgerBalance: parseFloat(row.subledger_balance || '0'),
                difference: parseFloat(row.difference || '0'),
                status: row.status as 'MATCHED' | 'DISCREPANCY',
                recommendation: row.recommendation,
            }));

            const discrepancies = accounts.filter((a) => a.status === 'DISCREPANCY');

            logger.info('Full reconciliation completed', {
                asOfDate: date,
                accountCount: accounts.length,
                discrepancyCount: discrepancies.length,
            });

            return {
                asOfDate: date,
                generatedAt: new Date().toISOString(),
                accounts,
                overallStatus: discrepancies.length === 0 ? 'ALL_RECONCILED' : 'HAS_DISCREPANCIES',
                discrepancyCount: discrepancies.length,
            };
        } catch (error: unknown) {
            logger.error('Full reconciliation failed', { asOfDate: date, error });
            throw error;
        }
    }

    /**
     * Get detailed discrepancy analysis
     *
     * Deep dive into specific account discrepancies
     */
    async getDiscrepancyDetails(
        accountCode: string,
        asOfDate?: string
    ): Promise<{
        accountCode: string;
        accountName: string;
        discrepancies: Array<{
            entityType: string;
            entityId: string;
            entityName: string;
            glBalance: number;
            subledgerBalance: number;
            difference: number;
        }>;
    }> {
        const date = asOfDate || getBusinessDate();

        try {
            let query = '';
            let entityType = '';

            switch (accountCode) {
                case '1200': // AR
                    entityType = 'CUSTOMER';
                    query = `
                        WITH customer_gl AS (
                            SELECT 
                                le."EntityId" as entity_id,
                                SUM(le."DebitAmount") - SUM(le."CreditAmount") as gl_balance
                            FROM ledger_entries le
                            JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
                            JOIN accounts a ON le."AccountId" = a."Id"
                            WHERE a."AccountCode" = '1200'
                              AND le."EntityType" = 'CUSTOMER'
                              AND lt."TransactionDate"::DATE <= $1
                              AND lt."Status" = 'POSTED'
                            GROUP BY le."EntityId"
                        ),
                        customer_invoices AS (
                            SELECT 
                                customer_id,
                                SUM(amount_due) as invoice_balance
                            FROM invoices
                            WHERE status IN ('UNPAID', 'PARTIALLY_PAID')
                            GROUP BY customer_id
                        )
                        SELECT 
                            'CUSTOMER' as entity_type,
                            c.id as entity_id,
                            c.name as entity_name,
                            COALESCE(cg.gl_balance, 0) as gl_balance,
                            COALESCE(ci.invoice_balance, 0) as subledger_balance,
                            COALESCE(cg.gl_balance, 0) - COALESCE(ci.invoice_balance, 0) as difference
                        FROM customers c
                        LEFT JOIN customer_gl cg ON cg.entity_id = c.id
                        LEFT JOIN customer_invoices ci ON ci.customer_id = c.id
                        WHERE ABS(COALESCE(cg.gl_balance, 0) - COALESCE(ci.invoice_balance, 0)) > 0.01
                        ORDER BY ABS(COALESCE(cg.gl_balance, 0) - COALESCE(ci.invoice_balance, 0)) DESC
                    `;
                    break;

                case '2100': // AP
                    entityType = 'SUPPLIER';
                    query = `
                        WITH supplier_gl AS (
                            SELECT 
                                le."EntityId" as entity_id,
                                SUM(le."CreditAmount") - SUM(le."DebitAmount") as gl_balance
                            FROM ledger_entries le
                            JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
                            JOIN accounts a ON le."AccountId" = a."Id"
                            WHERE a."AccountCode" = '2100'
                              AND UPPER(le."EntityType") = 'SUPPLIER'
                              AND lt."TransactionDate"::DATE <= $1
                              AND lt."Status" = 'POSTED'
                            GROUP BY le."EntityId"
                        )
                        SELECT 
                            'SUPPLIER' as entity_type,
                            s."Id" as entity_id,
                            s."CompanyName" as entity_name,
                            COALESCE(sg.gl_balance, 0) as gl_balance,
                            COALESCE(s."OutstandingBalance", 0) as subledger_balance,
                            COALESCE(sg.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0) as difference
                        FROM suppliers s
                        LEFT JOIN supplier_gl sg ON sg.entity_id = s."Id"::text
                        WHERE ABS(COALESCE(sg.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0)) > 0.01
                        ORDER BY ABS(COALESCE(sg.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0)) DESC
                    `;
                    break;

                default:
                    return {
                        accountCode,
                        accountName: 'Unknown',
                        discrepancies: [],
                    };
            }

            const result = await this.pool.query(query, [date]);

            return {
                accountCode,
                accountName: accountCode === '1200' ? 'Accounts Receivable' : 'Accounts Payable',
                discrepancies: result.rows.map((row) => ({
                    entityType: row.entity_type,
                    entityId: row.entity_id,
                    entityName: row.entity_name,
                    glBalance: parseFloat(row.gl_balance || '0'),
                    subledgerBalance: parseFloat(row.subledger_balance || '0'),
                    difference: parseFloat(row.difference || '0'),
                })),
            };
        } catch (error: unknown) {
            logger.error('Failed to get discrepancy details', { accountCode, asOfDate: date, error });
            throw error;
        }
    }
}

// Export singleton factory
let reconciliationServiceInstance: ReconciliationService | null = null;

export function getReconciliationService(pool: Pool): ReconciliationService {
    return new ReconciliationService(pool);
}
