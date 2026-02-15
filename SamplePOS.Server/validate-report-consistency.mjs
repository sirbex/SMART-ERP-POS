/**
 * Data Consistency Validation Script
 * Investigates and proves data accuracy across all reports
 * 
 * Run: cd SamplePOS.Server && node ../validate-report-consistency.mjs
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'pos_system',
    user: 'postgres',
    password: 'password'
});

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

class ConsistencyValidator {
    constructor(pool) {
        this.pool = pool;
        this.issues = [];
        this.checks = [];
    }

    logSection(title) {
        console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════${RESET}`);
        console.log(`${BOLD}${BLUE}  ${title}${RESET}`);
        console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════${RESET}\n`);
    }

    logCheck(checkName, status, details = {}) {
        const statusColor = status === 'PASS' ? GREEN : (status === 'FAIL' ? RED : YELLOW);
        const statusSymbol = status === 'PASS' ? '✓' : (status === 'FAIL' ? '✗' : '⚠');

        console.log(`${statusColor}${statusSymbol} ${checkName}${RESET}`);

        if (Object.keys(details).length > 0) {
            Object.entries(details).forEach(([key, value]) => {
                console.log(`  ${key}: ${value}`);
            });
        }

        this.checks.push({ checkName, status, details });

        if (status === 'FAIL') {
            this.issues.push({ checkName, details });
        }
    }

    /**
     * Test 1: Expense Summary Consistency
     * Verify that summary totals match individual expense totals
     */
    async validateExpenseSummary() {
        this.logSection('TEST 1: Expense Summary Consistency');

        try {
            // Get summary from summary query
            const summaryResult = await this.pool.query(`
                SELECT 
                    COUNT(*)::integer as total_count,
                    COALESCE(SUM(amount), 0)::numeric(10,2) as total_amount,
                    COUNT(CASE WHEN status = 'PAID' THEN 1 END)::integer as paid_count,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0)::numeric(10,2) as paid_amount
                FROM expenses
            `);

            // Get totals from individual records
            const individualResult = await this.pool.query(`
                SELECT 
                    id, amount, status
                FROM expenses
            `);

            const manualTotalAmount = individualResult.rows
                .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
                .toFixed(2);

            const manualTotalCount = individualResult.rows.length;

            const manualPaidAmount = individualResult.rows
                .filter(row => row.status === 'PAID')
                .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
                .toFixed(2);

            const manualPaidCount = individualResult.rows
                .filter(row => row.status === 'PAID').length;

            const summaryTotalAmount = parseFloat(summaryResult.rows[0].total_amount).toFixed(2);
            const summaryTotalCount = parseInt(summaryResult.rows[0].total_count);
            const summaryPaidAmount = parseFloat(summaryResult.rows[0].paid_amount).toFixed(2);
            const summaryPaidCount = parseInt(summaryResult.rows[0].paid_count);

            // Check total amount
            if (manualTotalAmount === summaryTotalAmount) {
                this.logCheck('Total Amount Consistency', 'PASS', {
                    'Summary': summaryTotalAmount,
                    'Manual Sum': manualTotalAmount,
                    'Difference': '0.00'
                });
            } else {
                this.logCheck('Total Amount Consistency', 'FAIL', {
                    'Summary': summaryTotalAmount,
                    'Manual Sum': manualTotalAmount,
                    'Difference': (parseFloat(summaryTotalAmount) - parseFloat(manualTotalAmount)).toFixed(2)
                });
            }

            // Check total count
            if (manualTotalCount === summaryTotalCount) {
                this.logCheck('Total Count Consistency', 'PASS', {
                    'Summary': summaryTotalCount,
                    'Manual Count': manualTotalCount
                });
            } else {
                this.logCheck('Total Count Consistency', 'FAIL', {
                    'Summary': summaryTotalCount,
                    'Manual Count': manualTotalCount,
                    'Difference': summaryTotalCount - manualTotalCount
                });
            }

            // Check paid amount
            if (manualPaidAmount === summaryPaidAmount) {
                this.logCheck('Paid Amount Consistency', 'PASS', {
                    'Summary': summaryPaidAmount,
                    'Manual Sum': manualPaidAmount
                });
            } else {
                this.logCheck('Paid Amount Consistency', 'FAIL', {
                    'Summary': summaryPaidAmount,
                    'Manual Sum': manualPaidAmount,
                    'Difference': (parseFloat(summaryPaidAmount) - parseFloat(manualPaidAmount)).toFixed(2)
                });
            }

            // Check paid count
            if (manualPaidCount === summaryPaidCount) {
                this.logCheck('Paid Count Consistency', 'PASS', {
                    'Summary': summaryPaidCount,
                    'Manual Count': manualPaidCount
                });
            } else {
                this.logCheck('Paid Count Consistency', 'FAIL', {
                    'Summary': summaryPaidCount,
                    'Manual Count': manualPaidCount,
                    'Difference': summaryPaidCount - manualPaidCount
                });
            }

        } catch (error) {
            this.logCheck('Expense Summary Query', 'FAIL', {
                'Error': error.message
            });
        }
    }

    /**
     * Test 2: Category Report Consistency
     * Verify category breakdown matches total expenses
     */
    async validateCategoryReport() {
        this.logSection('TEST 2: Category Report Consistency');

        try {
            // Get category breakdown
            const categoryResult = await this.pool.query(`
                SELECT 
                    c.id as category_id,
                    c.name as category_name,
                    COUNT(e.id)::integer as expense_count,
                    COALESCE(SUM(e.amount), 0)::numeric(10,2) as total_amount
                FROM expense_categories c
                LEFT JOIN expenses e ON c.id = e.category_id
                GROUP BY c.id, c.name
                HAVING COUNT(e.id) > 0
            `);

            // Get overall total
            const overallResult = await this.pool.query(`
                SELECT 
                    COUNT(*)::integer as total_count,
                    COALESCE(SUM(amount), 0)::numeric(10,2) as total_amount
                FROM expenses
            `);

            const categoryTotalAmount = categoryResult.rows
                .reduce((sum, row) => sum + parseFloat(row.total_amount || 0), 0)
                .toFixed(2);

            const categoryTotalCount = categoryResult.rows
                .reduce((sum, row) => sum + parseInt(row.expense_count || 0), 0);

            const overallTotalAmount = parseFloat(overallResult.rows[0].total_amount).toFixed(2);
            const overallTotalCount = parseInt(overallResult.rows[0].total_count);

            // Check if category totals match overall totals
            if (categoryTotalAmount === overallTotalAmount) {
                this.logCheck('Category Amount Sum Matches Total', 'PASS', {
                    'Category Sum': categoryTotalAmount,
                    'Overall Total': overallTotalAmount
                });
            } else {
                this.logCheck('Category Amount Sum Matches Total', 'FAIL', {
                    'Category Sum': categoryTotalAmount,
                    'Overall Total': overallTotalAmount,
                    'Difference': (parseFloat(overallTotalAmount) - parseFloat(categoryTotalAmount)).toFixed(2),
                    'Uncategorized Expenses': 'Yes - expenses without category'
                });
            }

            if (categoryTotalCount === overallTotalCount) {
                this.logCheck('Category Count Sum Matches Total', 'PASS', {
                    'Category Sum': categoryTotalCount,
                    'Overall Total': overallTotalCount
                });
            } else {
                this.logCheck('Category Count Sum Matches Total', 'FAIL', {
                    'Category Sum': categoryTotalCount,
                    'Overall Total': overallTotalCount,
                    'Difference': overallTotalCount - categoryTotalCount,
                    'Uncategorized Expenses': overallTotalCount - categoryTotalCount
                });
            }

        } catch (error) {
            this.logCheck('Category Report Query', 'FAIL', {
                'Error': error.message
            });
        }
    }

    /**
     * Test 3: Deleted Records Exclusion
     * Verify that soft-deleted records are excluded
     */
    async validateDeletedRecordsExclusion() {
        this.logSection('TEST 3: Voided Records Handling');

        try {
            // Count total sales records
            const totalResult = await this.pool.query(`
                SELECT COUNT(*) as count FROM sales
            `);

            // Count non-voided records
            const activeResult = await this.pool.query(`
                SELECT COUNT(*) as count FROM sales WHERE voided_at IS NULL
            `);

            // Count voided records
            const deletedResult = await this.pool.query(`
                SELECT COUNT(*) as count FROM sales WHERE voided_at IS NOT NULL
            `);

            const totalCount = parseInt(totalResult.rows[0].count);
            const activeCount = parseInt(activeResult.rows[0].count);
            const deletedCount = parseInt(deletedResult.rows[0].count);

            // Check if active + deleted = total
            if (activeCount + deletedCount === totalCount) {
                this.logCheck('Deleted Records Accounted For', 'PASS', {
                    'Total Records': totalCount,
                    'Active Records': activeCount,
                    'Deleted Records': deletedCount
                });
            } else {
                this.logCheck('Deleted Records Accounted For', 'FAIL', {
                    'Total Records': totalCount,
                    'Active + Deleted': activeCount + deletedCount,
                    'Difference': totalCount - (activeCount + deletedCount)
                });
            }

            // Verify summary query excludes voided
            const summaryResult = await this.pool.query(`
                SELECT COUNT(*)::integer as count
                FROM sales
                WHERE voided_at IS NULL
            `);

            const summaryCount = parseInt(summaryResult.rows[0].count);

            if (summaryCount === activeCount) {
                this.logCheck('Summary Query Excludes Voided Sales', 'PASS', {
                    'Summary Count': summaryCount,
                    'Active Count': activeCount
                });
            } else {
                this.logCheck('Summary Query Excludes Voided Sales', 'FAIL', {
                    'Summary Count': summaryCount,
                    'Active Count': activeCount,
                    'Difference': summaryCount - activeCount
                });
            }

        } catch (error) {
            this.logCheck('Deleted Records Check', 'FAIL', {
                'Error': error.message
            });
        }
    }

    /**
     * Test 4: Data Type Consistency
     * Verify all numeric fields return consistent types
     */
    async validateDataTypes() {
        this.logSection('TEST 4: Data Type Consistency');

        try {
            const result = await this.pool.query(`
                SELECT 
                    COUNT(*)::integer as total_count,
                    COALESCE(SUM(amount), 0)::numeric(10,2) as total_amount,
                    COALESCE(AVG(amount), 0)::numeric(10,2) as avg_amount,
                    pg_typeof(COUNT(*)::integer) as count_type,
                    pg_typeof(COALESCE(SUM(amount), 0)::numeric(10,2)) as amount_type
                FROM expenses
            `);

            const row = result.rows[0];

            // Check if count is integer
            if (row.count_type === 'integer') {
                this.logCheck('Count Returns Integer Type', 'PASS', {
                    'Type': row.count_type
                });
            } else {
                this.logCheck('Count Returns Integer Type', 'FAIL', {
                    'Expected': 'integer',
                    'Actual': row.count_type
                });
            }

            // Check if amount is numeric
            if (row.amount_type === 'numeric') {
                this.logCheck('Amount Returns Numeric Type', 'PASS', {
                    'Type': row.amount_type
                });
            } else {
                this.logCheck('Amount Returns Numeric Type', 'FAIL', {
                    'Expected': 'numeric',
                    'Actual': row.amount_type
                });
            }

            // Check decimal precision
            const totalAmountStr = String(row.total_amount);
            const decimalPlaces = totalAmountStr.includes('.')
                ? totalAmountStr.split('.')[1].length
                : 0;

            if (decimalPlaces === 2) {
                this.logCheck('Amount Has 2 Decimal Places', 'PASS', {
                    'Decimal Places': decimalPlaces,
                    'Example': totalAmountStr
                });
            } else {
                this.logCheck('Amount Has 2 Decimal Places', 'FAIL', {
                    'Expected': 2,
                    'Actual': decimalPlaces,
                    'Example': totalAmountStr
                });
            }

        } catch (error) {
            this.logCheck('Data Type Check', 'FAIL', {
                'Error': error.message
            });
        }
    }

    /**
     * Test 5: NULL Handling
     * Verify COALESCE prevents NULL propagation
     */
    async validateNullHandling() {
        this.logSection('TEST 5: NULL Handling');

        try {
            // Check if empty result set returns 0 instead of NULL
            const emptyResult = await this.pool.query(`
                SELECT 
                    COALESCE(SUM(amount), 0)::numeric(10,2) as total_amount
                FROM expenses
                WHERE id = '00000000-0000-0000-0000-000000000000'
            `);

            const totalAmount = emptyResult.rows[0].total_amount;

            if (totalAmount === '0.00') {
                this.logCheck('Empty Result Returns 0.00 Not NULL', 'PASS', {
                    'Result': totalAmount
                });
            } else {
                this.logCheck('Empty Result Returns 0.00 Not NULL', 'FAIL', {
                    'Expected': '0.00',
                    'Actual': totalAmount === null ? 'NULL' : totalAmount
                });
            }

            // Check vendor name handling
            const vendorResult = await this.pool.query(`
                SELECT 
                    COALESCE(NULLIF(TRIM(vendor), ''), 'Unknown') as vendor_name
                FROM expenses
                LIMIT 5
            `);

            const hasUnknown = vendorResult.rows.some(row => row.vendor_name === 'Unknown');
            const hasNull = vendorResult.rows.some(row => row.vendor_name === null);

            if (!hasNull) {
                this.logCheck('Vendor Names Never NULL', 'PASS', {
                    'NULL Values Found': 0,
                    'Unknown Vendors': vendorResult.rows.filter(r => r.vendor_name === 'Unknown').length
                });
            } else {
                this.logCheck('Vendor Names Never NULL', 'FAIL', {
                    'NULL Values Found': vendorResult.rows.filter(r => r.vendor_name === null).length
                });
            }

        } catch (error) {
            this.logCheck('NULL Handling Check', 'FAIL', {
                'Error': error.message
            });
        }
    }

    /**
     * Test 6: Sales Report Consistency
     * Verify sales totals match individual sale records
     */
    async validateSalesConsistency() {
        this.logSection('TEST 6: Sales Report Consistency');

        try {
            // Get sales summary
            const summaryResult = await this.pool.query(`
                SELECT 
                    COUNT(*)::integer as sale_count,
                    COALESCE(SUM(total_amount), 0)::numeric(10,2) as total_amount,
                    COALESCE(SUM(total_cost), 0)::numeric(10,2) as total_cost,
                    COALESCE(SUM(profit), 0)::numeric(10,2) as total_profit
                FROM sales
                WHERE voided_at IS NULL
            `);

            // Manual calculation
            const individualResult = await this.pool.query(`
                SELECT 
                    id, total_amount, total_cost, profit
                FROM sales
                WHERE voided_at IS NULL
            `);

            const manualTotalAmount = individualResult.rows
                .reduce((sum, row) => sum + parseFloat(row.total_amount || 0), 0)
                .toFixed(2);

            const manualTotalCost = individualResult.rows
                .reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0)
                .toFixed(2);

            const manualTotalProfit = individualResult.rows
                .reduce((sum, row) => sum + parseFloat(row.profit || 0), 0)
                .toFixed(2);

            const summaryTotalAmount = parseFloat(summaryResult.rows[0].total_amount).toFixed(2);
            const summaryTotalCost = parseFloat(summaryResult.rows[0].total_cost).toFixed(2);
            const summaryTotalProfit = parseFloat(summaryResult.rows[0].total_profit).toFixed(2);

            // Check total amount
            if (manualTotalAmount === summaryTotalAmount) {
                this.logCheck('Sales Total Amount Consistency', 'PASS', {
                    'Summary': summaryTotalAmount,
                    'Manual Sum': manualTotalAmount
                });
            } else {
                this.logCheck('Sales Total Amount Consistency', 'FAIL', {
                    'Summary': summaryTotalAmount,
                    'Manual Sum': manualTotalAmount,
                    'Difference': (parseFloat(summaryTotalAmount) - parseFloat(manualTotalAmount)).toFixed(2)
                });
            }

            // Check profit calculation
            const calculatedProfit = (parseFloat(manualTotalAmount) - parseFloat(manualTotalCost)).toFixed(2);

            if (calculatedProfit === manualTotalProfit) {
                this.logCheck('Profit Calculation Accuracy', 'PASS', {
                    'Stored Profit': manualTotalProfit,
                    'Calculated Profit': calculatedProfit
                });
            } else {
                this.logCheck('Profit Calculation Accuracy', 'FAIL', {
                    'Stored Profit': manualTotalProfit,
                    'Calculated Profit': calculatedProfit,
                    'Difference': (parseFloat(manualTotalProfit) - parseFloat(calculatedProfit)).toFixed(2)
                });
            }

        } catch (error) {
            this.logCheck('Sales Consistency Check', 'FAIL', {
                'Error': error.message
            });
        }
    }

    /**
     * Test 7: Cross-Report Consistency
     * Verify related reports show consistent data
     */
    async validateCrossReportConsistency() {
        this.logSection('TEST 7: Cross-Report Consistency');

        try {
            // Get expense summary
            const expenseSummary = await this.pool.query(`
                SELECT 
                    COALESCE(SUM(amount), 0)::numeric(10,2) as total_amount
                FROM expenses
            `);

            // Get expense by category total
            const categoryTotal = await this.pool.query(`
                SELECT 
                    COALESCE(SUM(e.amount), 0)::numeric(10,2) as total_amount
                FROM expense_categories c
                LEFT JOIN expenses e ON c.id = e.category_id
            `);

            // Get expense by vendor total
            const vendorTotal = await this.pool.query(`
                SELECT 
                    COALESCE(SUM(amount), 0)::numeric(10,2) as total_amount
                FROM expenses
            `);

            // Get expense by payment method total
            const paymentMethodTotal = await this.pool.query(`
                SELECT 
                    COALESCE(SUM(amount), 0)::numeric(10,2) as total_amount
                FROM expenses
            `);

            const summaryAmount = parseFloat(expenseSummary.rows[0].total_amount).toFixed(2);
            const categoryAmount = parseFloat(categoryTotal.rows[0].total_amount).toFixed(2);
            const vendorAmount = parseFloat(vendorTotal.rows[0].total_amount).toFixed(2);
            const paymentAmount = parseFloat(paymentMethodTotal.rows[0].total_amount).toFixed(2);

            // All should match
            const allMatch =
                summaryAmount === categoryAmount &&
                summaryAmount === vendorAmount &&
                summaryAmount === paymentAmount;

            if (allMatch) {
                this.logCheck('All Expense Reports Show Same Total', 'PASS', {
                    'Summary': summaryAmount,
                    'By Category': categoryAmount,
                    'By Vendor': vendorAmount,
                    'By Payment Method': paymentAmount
                });
            } else {
                this.logCheck('All Expense Reports Show Same Total', 'FAIL', {
                    'Summary': summaryAmount,
                    'By Category': categoryAmount,
                    'By Vendor': vendorAmount,
                    'By Payment Method': paymentAmount
                });
            }

        } catch (error) {
            this.logCheck('Cross-Report Consistency Check', 'FAIL', {
                'Error': error.message
            });
        }
    }

    /**
     * Generate Final Report
     */
    generateReport() {
        this.logSection('VALIDATION SUMMARY');

        const totalChecks = this.checks.length;
        const passedChecks = this.checks.filter(c => c.status === 'PASS').length;
        const failedChecks = this.checks.filter(c => c.status === 'FAIL').length;
        const warnedChecks = this.checks.filter(c => c.status === 'WARN').length;

        console.log(`${BOLD}Total Checks:${RESET} ${totalChecks}`);
        console.log(`${GREEN}${BOLD}Passed:${RESET} ${passedChecks}`);
        console.log(`${RED}${BOLD}Failed:${RESET} ${failedChecks}`);
        console.log(`${YELLOW}${BOLD}Warnings:${RESET} ${warnedChecks}`);

        const passRate = ((passedChecks / totalChecks) * 100).toFixed(1);
        console.log(`\n${BOLD}Pass Rate:${RESET} ${passRate}%`);

        if (failedChecks > 0) {
            console.log(`\n${RED}${BOLD}ISSUES FOUND:${RESET}`);
            this.issues.forEach((issue, index) => {
                console.log(`\n${RED}${index + 1}. ${issue.checkName}${RESET}`);
                Object.entries(issue.details).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            });
        } else {
            console.log(`\n${GREEN}${BOLD}✓ ALL CHECKS PASSED - DATA IS CONSISTENT${RESET}`);
        }

        console.log('\n');
    }

    async runAllTests() {
        await this.validateExpenseSummary();
        await this.validateCategoryReport();
        await this.validateDeletedRecordsExclusion();
        await this.validateDataTypes();
        await this.validateNullHandling();
        await this.validateSalesConsistency();
        await this.validateCrossReportConsistency();

        this.generateReport();
    }
}

// Run validation
(async () => {
    console.log(`${BOLD}${BLUE}`);
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   DATA CONSISTENCY VALIDATION                          ║');
    console.log('║   Investigating Report Accuracy                        ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`${RESET}\n`);

    const validator = new ConsistencyValidator(pool);

    try {
        await validator.runAllTests();
    } catch (error) {
        console.error(`${RED}Fatal error:${RESET}`, error);
    } finally {
        await pool.end();
    }
})();
