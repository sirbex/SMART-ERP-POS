# PROOF — Sales expense ops path

**Verdict:** PASS
**Generated:** 2026-09-05T11:49:52.013Z
**Gates:** 11/11

- PASS `NO_EXPORT_REPORT` — Sales Analytics no longer shows Export Report
- PASS `EXPENSE_CTA_GATE` — New Expense CTA is primaryActions + expenses.create only
- PASS `EXPENSE_FORM_SSOT` — Sales opens shared CreateExpenseForm (same SSOT as ExpensesPage)
- PASS `EXPENSE_LABEL_PARITY` — Sales modal title matches ExpensesPage create dialog
- PASS `OPS_EXPENSES_ROUTE` — /expenses: expenses.read|create, Layout, NO accounting feature
- PASS `ACCT_EXPENSES_ROUTE` — /accounting/expenses keeps accounting feature + AccountingLayout
- PASS `CASHIER_GRANTS_EXPENSE` — Default cashier grant set includes expenses.create + expenses.read
- PASS `CASHIER_PATH_EXPENSES` — Cashier lockdown allows /expenses when expense keys granted
- PASS `CASHIER_NAV_EXPENSES` — Cashier nav surfaces Expenses → /expenses
- PASS `API_CREATE_PERM` — POST /expenses requires expenses.create
- PASS `API_NO_ACCT_FEATURE_ON_CREATE` — Expense routes are not feature-flagged to accounting module

## Integrity
Sales Analytics New Expense (expenses.create) opens CreateExpenseForm without Accounting feature; /expenses ops route + cashier lockdown SSOT; /accounting/expenses remains accounting-locked.
