# Expense Category ↔ GL Consistency

**Date:** 2026-07-24  
**Migration:** `shared/sql/561_expense_category_gl_consistency.sql`  
**Proof:** `npx vitest run src/__tests__/expense-category-gl-proof.test.ts` (from `samplepos.client`)

## Problem

Expenses were not reliably tied to `expense_categories` or the correct P&L accounts:

| Issue | Effect |
|--|--|
| Dual category codes (`OFFICE` vs `OFFICE_SUPPLIES`, `PROFESSIONAL` vs `PROFESSIONAL_SERVICES`) | Create looked up GL by code miss → fell back to **6900** |
| Create form sent code only (no `categoryId`) | `expenses.category_id` often null → reports/filters wrong |
| Category list filter sent `category` code; API expected `categoryId` UUID | Filter silently did nothing |
| Approval GL used hardcoded map only | Ignored `expense_categories.account_id` |
| New categories created without `account_id` | Always posted to General Expense |

## Fix

1. **Migration 561** — ensure canonical categories, link `account_id` to CoA, backfill `expenses.category_id` / `account_id`, deactivate alias duplicates, drop restrictive `category` CHECK.
2. **Create/update expense** — resolve category by id or code (with aliases), always set `category`, `category_id`, and `account_id`.
3. **Approval GL** — `resolveExpenseGlAccountCode` from DB; hardcoded map is fallback only.
4. **UI** — create sends `categoryId`; list filter uses category UUID.
5. **Shared map** — `shared/expense/categoryGlMap.ts` (canonical codes ↔ CoA).

## CoA mapping (canonical)

| Category | Account |
|--|--|
| OFFICE | 6400 |
| UTILITIES | 6200 |
| MARKETING | 6300 |
| TRAVEL / MEALS / FUEL / ACCOMMODATION | 6800 |
| PROFESSIONAL | 6700 |
| SALARIES / ALLOWANCE | 6000 |
| RENT | 6100 |
| INSURANCE | 6600 |
| OTHER / MAINTENANCE / EQUIPMENT / SOFTWARE / TRAINING | 6900 |

## Apply

Tenant migrations pick up `561_expense_category_gl_consistency.sql` on next migrate/restart (same runner as other `shared/sql/NNN_*.sql` files).
