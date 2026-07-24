# Expense-only deploy plan

**Date:** 2026-07-24  
**Branch:** `main`  
**Scope:** Expenses category/GL accuracy, pay-from balances, SAP reports — **no restaurant**

## Include (ship)

| Area | Paths |
|--|--|
| Migration | `shared/sql/561_expense_category_gl_consistency.sql` |
| Shared map | `shared/expense/categoryGlMap.ts` |
| Types/zod | `shared/types/expense.ts`, `shared/zod/expense.ts` |
| Server | `expenseController`, `expenseRepository`, `expenseService`, `glEntryService`, `types/expense` |
| Client | `CreateExpenseForm`, `useExpenses`, `ExpensesPage`, `ExpenseReportsPage` |
| Proofs | `expense-*-proof.test.ts`, `PROOF_EXPENSE_*.md` |

## Exclude (leave unstaged)

Restaurant module, `560_restaurant_foundation.sql`, `App.tsx` / `Layout.tsx` / `server.ts` restaurant wiring, RBAC/tenant/system-settings restaurant flags, orders restaurant hooks.

## Gate (proof only)

```powershell
cd samplepos.client
npx vitest run `
  src/__tests__/expense-reports-sap-proof.test.ts `
  src/__tests__/expense-category-gl-proof.test.ts `
  src/__tests__/expenses-petty-ux-proof.test.ts
```

## Deploy steps

1. Commit **include** list only  
2. Push `main` → triggers `.github/workflows/deploy-production.yml`  
3. Migration **561** applies via `scripts/deploy-update.sh` to all tenant DBs  
4. Post-deploy: expense create → approve → mark paid (funded account only); open Expense Reports column chooser  

## Rollback

Revert the expense commit; migration 561 is additive/idempotent (category links + backfill) — do not drop data.
