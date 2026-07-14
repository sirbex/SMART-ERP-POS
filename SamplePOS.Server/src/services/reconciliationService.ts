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
import type {
  ApCacheLane,
  ApIntegrityLane,
  ApJournalAuditLane,
} from '../modules/supplier-payments/apReconciliationLanes.js';
import type {
  ArCacheLane,
  ArIntegrityLane,
  ArJournalAuditLane,
} from '../modules/customer-payments/arReconciliationLanes.js';
import {
  captureArReconciliationMetrics,
  isArGlIntegrityMatched,
} from '../modules/customer-payments/arReconciliationMetrics.js';
import type {
  InventoryCacheLane,
  InventoryIntegrityLane,
  InventoryJournalAuditLane,
} from '../modules/inventory/inventoryReconciliationLanes.js';
import {
  captureInventoryReconciliationMetrics,
  isInventoryGlIntegrityMatched,
} from '../modules/inventory/inventoryReconciliationMetrics.js';
import {
  getFinancialLane as fetchFinancialLane,
  getAllDomainSummaries,
  withLegacyApFields,
  withLegacyArFields,
  withLegacyInventoryFields,
} from '../modules/financial-reconciliation/financialLaneService.js';
import {
  compareSqlSummaryToFramework,
  type ReconciliationParityReport,
} from '../modules/financial-reconciliation/reconciliationParityService.js';
import { logLegacyReconciliationAccess } from '../modules/financial-reconciliation/legacyReconciliationAudit.js';
import type { FinancialLaneResult } from '../modules/financial-reconciliation/types.js';

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
    /** Phase F0 — framework is authoritative; SQL parity logged when mismatched. */
    _meta?: {
        authoritative: 'financial-lane-framework';
        legacyParity?: ReconciliationParityReport;
    };
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
            const m = await captureArReconciliationMetrics(this.pool, date);
            const glBalance = m.glNetActive1200;
            const customerScopeGl = m.glCustomerScopeNetActive;
            const openItemSubledger = m.openItemSubledger;
            const customerTableBalance = m.customersTableSum;
            const storedBalance = m.storedBalance1200;
            const arGlIntegrityOk = isArGlIntegrityMatched(m);

            const items: ReconciliationItem[] = [
                {
                    source: 'GL_AR_BALANCE',
                    description: `Accounts Receivable (1200) net-active GL balance as of ${date}`,
                    amount: glBalance,
                    difference: 0,
                    status: 'BASE' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'UNALLOCATED_RECEIPTS',
                    description:
                        'Posted AR receipts not yet allocated to invoices (reduces open-item subledger)',
                    amount: m.unallocatedPayments,
                    difference: 0,
                    status: 'INFO' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'OPEN_ITEM_SUBLEDGER',
                    description:
                        'Open-item AR subledger (invoice amount_due − unallocated receipts) as of '
                        + date,
                    amount: openItemSubledger,
                    difference: 0,
                    status: 'BASE' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'CUSTOMER_AR_GL',
                    description:
                        'Net-active GL (1200) vs open-item subledger as of '
                        + date,
                    amount: glBalance,
                    difference: m.integrityGlDrift,
                    status: arGlIntegrityOk
                        ? ('MATCHED' as ReconciliationItem['status'])
                        : ('DISCREPANCY' as ReconciliationItem['status']),
                    details: {
                        customerScopeGl,
                        unallocatedPayments: m.unallocatedPayments,
                    },
                },
                {
                    source: 'CUSTOMER_BALANCE',
                    description: 'Sum of per-customer balances (customers table cache)',
                    amount: customerTableBalance,
                    difference: m.customerCacheDrift,
                    status:
                        Math.abs(m.customerCacheDrift) < 0.01
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
                if (Math.abs(m.customerCacheDrift) > 0.01) {
                    recommendations.push(
                        'Cache drift — POST /api/system/gl/recalc-customer-balances',
                    );
                }
                if (!arGlIntegrityOk) {
                    recommendations.push(
                        'CUSTOMER_AR_GL: investigate per-customer GL vs open-item gaps (Lane 1 integrity)',
                    );
                    recommendations.push('Run proof-ar-drift-decompose.mjs before any GL adjustment');
                }
                recommendations.push('Review customer payment applications and unallocated receipts');
            }

            return {
                accountName: 'Accounts Receivable',
                accountCode: '1200',
                asOfDate: date,
                generatedAt: new Date().toISOString(),
                glBalance,
                subledgerBalance: openItemSubledger,
                difference: m.integrityGlDrift,
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
            const m = await captureInventoryReconciliationMetrics(this.pool, date);
            const glBalance = m.glNetActive1300;
            const batchSubledger = m.batchSubledger;
            const productValuation = m.productValuationCache;
            const storedBalance = m.storedBalance1300;
            const inventoryIntegrityOk = isInventoryGlIntegrityMatched(m);

            const items: ReconciliationItem[] = [
                {
                    source: 'GL_INVENTORY_BALANCE',
                    description: `Inventory (1300) net-active GL balance as of ${date}`,
                    amount: glBalance,
                    difference: 0,
                    status: 'BASE' as ReconciliationItem['status'],
                    details: null,
                },
                {
                    source: 'BATCH_VALUATION',
                    description: 'Batch subledger (inventory_batches remaining × cost_price)',
                    amount: batchSubledger,
                    difference: m.integrityGlDrift,
                    status: inventoryIntegrityOk
                        ? ('MATCHED' as ReconciliationItem['status'])
                        : ('DISCREPANCY' as ReconciliationItem['status']),
                    details: {
                        materialityThreshold: m.materialityThreshold,
                    },
                },
                {
                    source: 'PRODUCT_VALUATION',
                    description: 'Product header cache (qty × cost_price — informational only)',
                    amount: productValuation,
                    difference: m.productCacheDrift,
                    status:
                        Math.abs(m.productCacheDrift) < 0.01
                            ? ('INFO' as ReconciliationItem['status'])
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

            let hasDiscrepancy = items.some((i) => i.status === 'DISCREPANCY');

            let integrityIssues: IntegrityIssue[] | undefined;
            let integritySummary: string | undefined;
            try {
                const integrity = await checkInventoryIntegrity(this.pool);
                if (integrity.issues.length > 0) {
                    integrityIssues = integrity.issues;
                    integritySummary = integrity.summary;
                }
                const criticalCount = integrity.issues.filter((i) => i.severity === 'CRITICAL').length;
                if (criticalCount > 0) {
                    hasDiscrepancy = true;
                }
            } catch (integrityError: unknown) {
                logger.warn('Integrity check failed (non-fatal)', {
                    error: integrityError instanceof Error ? integrityError.message : String(integrityError),
                });
            }

            const recommendations: string[] = [];
            if (hasDiscrepancy) {
                if (!inventoryIntegrityOk) {
                    recommendations.push(
                        'BATCH_VALUATION: investigate GL vs batch subledger (Lane 1 integrity)',
                    );
                    recommendations.push('Run diag-inventory-gl-drift.mjs before any GL adjustment');
                }
                if (Math.abs(m.productCacheDrift) > 0.01) {
                    recommendations.push('POST /api/system/gl/rebuild-inventory-balances');
                }
                if (Math.abs(m.storedBalanceDrift) > 0.01) {
                    recommendations.push('POST /api/system/gl/rebase-account-balances with accountCodes=[1300]');
                }
                if (integrityIssues?.some((i) => i.severity === 'CRITICAL')) {
                    recommendations.push('Resolve CRITICAL stock movements without GL posting');
                }
            }

            return {
                accountName: 'Inventory',
                accountCode: '1300',
                asOfDate: date,
                generatedAt: new Date().toISOString(),
                glBalance,
                subledgerBalance: batchSubledger,
                difference: m.integrityGlDrift,
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
                        'SUPPLIER_AP_GL: GET /api/system/gl/ap-drift-assessment then fix per-supplier document gaps (do not use heal-ap-drift)',
                    );
                    recommendations.push('Run proof-ap-drift-decompose.mjs before any GL adjustment');
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
     * Phase F0: Framework-authoritative (lane integrity metrics). Legacy SQL
     * fn_full_reconciliation_report is compared for parity logging only.
     */
    async getFullReconciliation(asOfDate?: string): Promise<FullReconciliationSummary> {
        const date = asOfDate || getBusinessDate();

        try {
            logLegacyReconciliationAccess('erp.reconciliation.summary', {
                method: 'GET',
                path: '/api/erp-accounting/reconciliation/summary',
                query: { asOfDate: date },
                headers: {},
            });

            const [cash, ar, inventory, ap] = await Promise.all([
                this.reconcileCash(date),
                this.reconcileAccountsReceivable(date),
                this.reconcileInventory(date),
                this.reconcileAccountsPayable(date),
            ]);

            const accounts = [cash, ar, inventory, ap].map((report) => ({
                accountName: report.accountName,
                glBalance: report.glBalance,
                subledgerBalance: report.subledgerBalance,
                difference: report.difference,
                status: (report.status === 'RECONCILED' ? 'MATCHED' : 'DISCREPANCY') as 'MATCHED' | 'DISCREPANCY',
                recommendation: report.recommendations[0] ?? '',
            }));

            const discrepancies = accounts.filter((a) => a.status === 'DISCREPANCY');

            let legacyParity;
            try {
                legacyParity = await compareSqlSummaryToFramework(this.pool, date);
            } catch (parityError: unknown) {
                logger.warn('[LEGACY RECON] SQL parity check failed (non-fatal)', {
                    asOfDate: date,
                    error: parityError instanceof Error ? parityError.message : String(parityError),
                });
            }

            logger.info('Full reconciliation completed (framework-authoritative)', {
                asOfDate: date,
                accountCount: accounts.length,
                discrepancyCount: discrepancies.length,
                legacyParityOk: legacyParity?.ok,
            });

            return {
                asOfDate: date,
                generatedAt: new Date().toISOString(),
                accounts,
                overallStatus: discrepancies.length === 0 ? 'ALL_RECONCILED' : 'HAS_DISCREPANCIES',
                discrepancyCount: discrepancies.length,
                _meta: {
                    authoritative: 'financial-lane-framework',
                    legacyParity,
                },
            };
        } catch (error: unknown) {
            logger.error('Full reconciliation failed', { asOfDate: date, error });
            throw error;
        }
    }

    /** Lane 1 — net-active GL vs open-item (period close). */
    async getApIntegrityLane(asOfDate?: string): Promise<ApIntegrityLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyApFields(await fetchFinancialLane(this.pool, 'ap', 'integrity', date)) as unknown as ApIntegrityLane & FinancialLaneResult;
    }

    /** Lane 2 — open-item vs supplier cache (maintenance). */
    async getApCacheLane(asOfDate?: string): Promise<ApCacheLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyApFields(await fetchFinancialLane(this.pool, 'ap', 'cache', date)) as unknown as ApCacheLane & FinancialLaneResult;
    }

    /** Lane 3 — gross posted vs net-active (journal audit, informational). */
    async getApJournalAuditLane(asOfDate?: string): Promise<ApJournalAuditLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyApFields(await fetchFinancialLane(this.pool, 'ap', 'history', date)) as unknown as ApJournalAuditLane & FinancialLaneResult;
    }

    /** Lane 1 — net-active GL vs open-item (period close). */
    async getArIntegrityLane(asOfDate?: string): Promise<ArIntegrityLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyArFields(await fetchFinancialLane(this.pool, 'ar', 'integrity', date)) as unknown as ArIntegrityLane & FinancialLaneResult;
    }

    /** Lane 2 — open-item vs customer cache (maintenance). */
    async getArCacheLane(asOfDate?: string): Promise<ArCacheLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyArFields(await fetchFinancialLane(this.pool, 'ar', 'cache', date)) as unknown as ArCacheLane & FinancialLaneResult;
    }

    /** Lane 3 — gross posted vs net-active (journal audit, informational). */
    async getArJournalAuditLane(asOfDate?: string): Promise<ArJournalAuditLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyArFields(await fetchFinancialLane(this.pool, 'ar', 'history', date)) as unknown as ArJournalAuditLane & FinancialLaneResult;
    }

    /** Lane 1 — net-active GL vs batch subledger (period close). */
    async getInventoryIntegrityLane(asOfDate?: string): Promise<InventoryIntegrityLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyInventoryFields(await fetchFinancialLane(this.pool, 'inventory', 'integrity', date)) as unknown as InventoryIntegrityLane & FinancialLaneResult;
    }

    /** Lane 2 — batch subledger vs product cache (maintenance). */
    async getInventoryCacheLane(asOfDate?: string): Promise<InventoryCacheLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyInventoryFields(await fetchFinancialLane(this.pool, 'inventory', 'cache', date)) as unknown as InventoryCacheLane & FinancialLaneResult;
    }

    /** Lane 3 — gross posted vs net-active (journal audit, informational). */
    async getInventoryJournalAuditLane(asOfDate?: string): Promise<InventoryJournalAuditLane & FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        return withLegacyInventoryFields(await fetchFinancialLane(this.pool, 'inventory', 'history', date)) as unknown as InventoryJournalAuditLane & FinancialLaneResult;
    }

    /** Generic financial lane (framework entry point). */
    async getFinancialLane(
        domain: 'ap' | 'ar' | 'inventory' | 'cash' | 'wht',
        lane: 'integrity' | 'cache' | 'history',
        asOfDate?: string,
    ): Promise<FinancialLaneResult> {
        const date = asOfDate || getBusinessDate();
        const result = await fetchFinancialLane(this.pool, domain, lane, date);
        if (domain === 'ap') return withLegacyApFields(result) as FinancialLaneResult;
        if (domain === 'ar') return withLegacyArFields(result) as FinancialLaneResult;
        if (domain === 'inventory') return withLegacyInventoryFields(result) as FinancialLaneResult;
        return result;
    }

    /** All registered domain lane summaries (health dashboard). */
    async getFinancialHealthSummary(asOfDate?: string) {
        const date = asOfDate || getBusinessDate();
        return getAllDomainSummaries(this.pool, date);
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
const reconciliationServiceInstance: ReconciliationService | null = null;

export function getReconciliationService(pool: Pool): ReconciliationService {
    return new ReconciliationService(pool);
}
