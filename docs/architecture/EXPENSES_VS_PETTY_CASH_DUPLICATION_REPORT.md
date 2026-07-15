# Expenses vs Petty Cash — Duplication Report

**Date:** 2026-07-15  
**Scope:** Accounting → Expenses vs Banking → Petty cash vs register “Petty Cash Expense”  
**Status:** Investigation + **P0/P1 UX fixes shipped** (2026-07-15)

### UX fixes implemented
- Register cash-out: **Spend from petty float** (was “Petty Cash Expense”)
- Expenses page + nav: voucher / approve / pay-from-bank purpose copy
- Petty cash tab: points Operators to Expenses for bank-paid vouchers
- Create Expense: **hidden** Paid-at-create + Pay From Account; always creates **UNPAID**
- Proof: `npx vitest run src/__tests__/expenses-petty-ux-proof.test.ts`

## Verdict

This is **not** the same duplicate pattern as Banking vs Deposit Worksheet.  
**Expenses** and **Petty Cash** look similar because both say “expense,” but they use **different journals, CoA, and workflows**.

| | **Expenses module** | **Petty Cash (Banking tab / register)** |
|--|--|--|
| Purpose | Company expense **voucher** (approve → pay from bank/cash) | Spend from the **petty float (1012)** |
| Object | `expenses` row | Treasury Document `PETTY_CASH` |
| Typical pay from | Bank **1030** or drawer CoA **1010** (never 1012 today) | Always credit **1012** |
| P&L | Category → 6xxx (e.g. 6400 office) | Default **6900** |
| When paid | Often DR **2100** / CR bank after approval | One shot DR expense / CR **1012** |

**Do not merge** Expenses into Petty Cash. Fix **language**, broken create-form “Paid” UX, and flag-on till math.

## Operator scenarios

| Intent | Use this | Not this |
|--|--|--|
| Bought supplies **from the float** | Banking → Petty cash → Record expense from float (or register Petty Cash Expense when treasury ON) | Expenses → Mark paid from bank |
| Expense voucher **paid from bank** | Expenses → create → approve → Mark paid (1030) | Petty cash EXPENSE (hits 1012) |

## What feels duplicated (UX only)

1. Accounting → **Expenses** (“Track company expenses”)  
2. Banking → **Petty cash** → “Record expense from float”  
3. Register Cash Out → **Petty Cash Expense** (same GL as #2 when treasury ON)  
4. Create Expense form “Paid” + “Pay From Account” (looks like cash spend but **does not wire through create API**)

## Flag matrix (petty spend)

| Surface | Flag OFF | Flag ON |
|--|--|--|
| Banking → Petty cash | Tab hidden | FUND / REPLENISH / EXPENSE |
| Register Petty Cash Expense | DR 6900 / CR **1010** (`EXPENSE_PAYMENT`) | Shim → TD: DR 6900 / CR **1012** |
| Expenses module | Unchanged | Unchanged |

## Recommendations

| Item | Action | Why |
|--|--|--|
| Expenses vs Petty Cash EXPENSE | **KEEP** both | Different domains (voucher/AP vs float) |
| Register vs Petty cash tab | **KEEP** + **RENAME** register | Same engine when flag ON; different context (till vs accounting) |
| Create Expense “Paid at create” | **HIDE or FIX** | Collects fields that create API ignores → fake cash-spend UX |
| Expense payment allowing 1012 | **KEEP blocked** | Float spend must stay on Petty/TD |
| Register expected-cash when flag ON petty expense | **FIX** | Still subtracts `CASH_OUT_EXPENSE` from till even though GL credits 1012 |

Suggested rename: register **“Spend from petty float”** (not “Petty Cash Expense”) so it does not compete with Accounting → Expenses.

## Unique value

- **Expenses:** approval, categories→6xxx, unpaid AP 2100, bank pay + reports  
- **Petty Cash:** dedicated 1012, fund/replenish, TD audit  
- **Register:** cashier session without Accounting access  
- **Supplier payments:** AP bills — not opex vouchers  

## “Expense” confusion map

1. Expense **voucher** → Expenses module  
2. **Float spend** → Petty cash / register  
3. **Drawer withdrawal** → register `CASH_OUT_OTHER` (1010)  
4. **Supplier bill pay** → Supplier Payments  
5. Chart **EXPENSE** account type → many GL codes  

## Key paths

- `samplepos.client/src/pages/accounting/ExpensesPage.tsx`  
- `samplepos.client/src/pages/accounting/PettyCashPage.tsx`  
- `samplepos.client/src/components/cash-register/CashMovementDialog.tsx`  
- `SamplePOS.Server/src/services/expenseService.ts` / `glEntryService.ts`  
- `SamplePOS.Server/src/modules/treasury/pettyCashService.ts`  
- Touchpoints **T07** (register shim), **T10** (petty UI)

## Related

Banking liquidity merge (resolved): `TREASURY_BANKING_DUPLICATION_REPORT.md`
