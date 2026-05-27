# AR, GL 1200, and Customer Balances — How the System Works

This document explains why dashboard AR and balance sheet AR can diverge, how SamplePOS aligns with SAP/Odoo, and how operators should correct opening balances.

## Two ledgers, one business truth

| Layer | What it stores | Used for |
|-------|----------------|----------|
| **Subledger (customers)** | `customers.balance` = Σ open `invoices.amount_due` (INVOICE + OPENING_BALANCE) | Credit limits, customer dashboard, collections |
| **General ledger (1200)** | `ledger_entries` on Accounts Receivable | Balance sheet, trial balance, financial integrity |

GL 1200 is posted only through **AccountingCore** (sales, payments, credit notes, opening balance, reversals).  
`customers.balance` is recalculated from invoices — it is **not** copied from GL.

**SAP/Odoo equivalent:** FI-AR subledger vs G/L account reconciliation (FBL5N / Partner Ledger vs G/L).

They must agree. Integrity checks compare:

- GL 1200 (net-active posted entries)
- Σ `customers.balance`

## Net-active ledger (why reversals matter)

A voided credit sale creates:

1. Original SALE journal (DR 1200) — marked `IsReversed = TRUE`
2. Reversal journal (CR 1200) — excluded via `ReversedByTransactionId`

**Wrong approach:** Sum all `POSTED` rows → reversal still counts → AR overstated (~UGX 413k on Henber).

**Correct approach:** `LEDGER_NET_ACTIVE_SQL` — exclude both legs of every reversal pair.

Balance sheet and integrity use net-active logic.  
`gl_period_balances` rebuild (admin heal) uses the same filter after the 2026-05 fix.

## What causes unacceptable drift

| Cause | Symptom | Prevention |
|-------|---------|------------|
| Manual SQL deleting `ledger_entries` without updating invoices | GL ≠ customers | Never delete GL; use void/refund APIs |
| Stale `gl_period_balances` | BS wrong while dashboard OK | Rebuild after bulk fixes; BS now reads ledger directly |
| Legacy payment path without invoice allocation | customers.balance wrong | Use AR Payments module |
| Opening balance wrong amount | OB invoice ≠ expectation | **Cancel + replace** (see below) |
| Manual journal to 1200 | Blocked by posting governance | Use OB or credit note flows |

## Opening balance (cutover) — SAP/Odoo pattern

**Post migration OB**

- Customer: DR 1200 / CR 3050 (Opening Balance Equity), `CUTOVER_OB`
- Supplier: DR 3050 / CR 2100
- One active OB document per party (`OB-######`)

**Correct a wrong OB figure (FB08 / reverse entry + re-enter)**

1. **Cancel** existing OB → reverses GL, sets invoice `CANCELLED`, `amount_due = 0`
2. **Post** new OB with correct amount

API: `POST /api/customers/opening-balance/replace` (same for suppliers).

**Not supported for end users**

- Manual journal to 1200 (governance blocks this — by design)
- Editing posted OB amount in place (no audit trail)
- Credit note against `OPENING_BALANCE` (use cancel/replace instead)

**Journal entry alternative**

Accountants can use `POST /api/system/gl/reverse-transaction` on the OB journal, but must also cancel the OB invoice or subledger will drift. The productized path is cancel/replace.

## Operator checklist after data cleanup

1. Refresh balance sheet — AR 1200 should match Total AR on dashboard.
2. Run **GL Integrity** (`/api/system/gl/integrity` or Accounting → GL Integrity).
3. If period totals stale: `POST /api/system/gl/rebuild-period-balances`.
4. Wrong OB: use **Replace opening balance** on Customer/Supplier Payments.
