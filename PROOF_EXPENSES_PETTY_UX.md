# Expenses vs Petty Cash UX Fixes — Proof

Run: 2026-07-15

## Changes
1. Register Cash Out: **Spend from petty float** (was Petty Cash Expense)
2. Expenses page + nav: voucher / approve / pay-from-bank copy
3. Petty cash: points to Expenses for bank-paid vouchers
4. Create Expense: Paid-at-create UI removed; always creates UNPAID

## Evidence
```
npx vitest run src/__tests__/expenses-petty-ux-proof.test.ts
 → 3 passed
```

**Overall: PASS**
