# PROOF_EXPENSE_EMPLOYEE_AUDIT

Generated: 2026-08-14T07:39:31.069Z

**Result: PASS** — 35/35 gates

## Model

- `expenses.employee_id` = audit link (who received daily allowance / claim)
- NOT payroll gross, NOT advance recovery, NOT NSSF/PAYE
- `employees.MonthlyAllowance` = contractual payroll component (separate)

## Inconsistencies (tested)

- **FIXED** `update_allowance_parity` — Create required employeeId for ALLOWANCE but UpdateExpenseSchema/service did not — both now enforce
- **FIXED** `client_filter_employeeId` — ExpenseFilter.employeeId existed but getExpenses did not append it — now wired
- **FIXED** `update_category_drop` — Update accepted zod.category but controller dropped it — now mapped + repo resolves code
- **FIXED** `export_missing_staff` — DETAILED_LIST had employeeName; CSV export omitted Staff — now included
- **FIXED** `migration_anchor_missing_603` — 603 employee_id had no MIGRATION_COLUMN_ANCHORS entry — column drift could go unrepaired
- **FIXED** `hr_create_allowance_skip` — createEmployee only post-updated MonthlyAllowance when >0 — now INSERT includes allowance
- **FIXED** `ui_staff_filter_missing` — employeeId filter API existed but ExpensesPage had no Staff filter — added
- **FIXED** `create_log_referenceNumber` — create logged expense.referenceNumber (usually undefined) — now expenseNumber

## Gates

- [x] **schema/migration_603** — 603 adds expenses.employee_id
- [x] **schema/fk_employees** — FK to employees.Id ON DELETE SET NULL
- [x] **schema/not_payroll_comment** — column comment: audit only, not payroll
- [x] **zod_create/allowance_requires_employee** — ALLOWANCE without employeeId rejected
- [x] **zod_create/allowance_with_employee** — ALLOWANCE + employeeId accepted
- [x] **zod_create/travel_optional_employee** — TRAVEL without employee allowed (optional audit)
- [x] **zod_update/allowance_requires_employee** — UpdateExpenseSchema rejects ALLOWANCE + null employeeId
- [x] **service/update_allowance_guard** — updateExpense resolves category_id then refuses ALLOWANCE without employee
- [x] **repo/insert_employee_id** — INSERT includes employee_id
- [x] **repo/list_join_employee** — list/get JOIN employees for employee_name
- [x] **repo/normalize_fields** — normalizeExpenseFromDb maps employeeId + employeeName
- [x] **repo/staff_options** — staff picker query (ACTIVE employees)
- [x] **api/create_maps_employee** — createExpense maps employeeId → employee_id
- [x] **api/staff_route_no_hr_read** — GET /expenses/staff-options uses expenses.* not hr.read
- [x] **api/filter_employeeId** — list filter accepts employeeId
- [x] **ui/create_form_picker** — CreateExpenseForm staff picker
- [x] **ui/create_form_not_payroll** — UI states audit-only (not payroll/NSSF)
- [x] **ui/list_staff_column** — Expenses list/detail show employeeName
- [x] **ui/reports_staff_column** — DETAILED_LIST report column Staff
- [x] **ui/hook_filter_employeeId** — useExpenses appends employeeId query param
- [x] **payroll/gross_basic_plus_monthly** — gross=1100000
- [x] **payroll/deduction_is_advance_only** — recovered=50000
- [x] **payroll/net_after_advance** — net=1050000
- [x] **payroll/ssot_boundary_comment** — payrollMath documents expense vs MonthlyAllowance boundary
- [x] **payroll/no_expense_import** — hr.service / payrollMath do not read expenses.employee_id
- [x] **hr_ui/monthly_allowance_field** — Employees form exposes Monthly Allowance (payroll)
- [x] **hr_ui/points_daily_to_expenses** — HR form points daily transport to Expenses
- [x] **drift/update_maps_category** — update maps zod.category → UpdateExpenseData.category
- [x] **drift/repo_resolves_category_code** — update resolves category from code or id
- [x] **drift/export_staff_column** — CSV export includes Staff (employeeName)
- [x] **drift/migration_anchor_603** — MIGRATION_COLUMN_ANCHORS includes expenses.employee_id
- [x] **drift/hr_create_inserts_allowance** — employee create INSERT includes MonthlyAllowance (no >0-only post-update)
- [x] **drift/ui_staff_filter** — Expenses list Staff filter wired
- [x] **drift/create_log_expenseNumber** — create log uses expenseNumber (not undefined referenceNumber)
- [x] **drift/service_test_validation_error_mock** — expenseService.test mocks ValidationError (import no longer breaks)

## Re-run

```
cd SamplePOS.Server
npm test -- --runInBand src/modules/expenses/expenseEmployeeLink.evidence.test.ts
```
