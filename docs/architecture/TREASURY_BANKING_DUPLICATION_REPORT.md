# Banking vs Treasury Documents — Duplication Report

**Date:** 2026-07-15  
**Updated:** 2026-07-15 — P0 merge implemented in UI  
**Scope:** Operator overlap between Banking / Cash Register and Treasury Documents  
**Status:** Investigation + **UI merge shipped** (see Implementation below)

## Verdict

Overlap was mostly **dual entry points and naming collisions**, not two posting engines when `treasury_document_enabled` is ON. Legacy Banking and Cash Register paths **shim into Treasury Document writers**.

## Implementation (2026-07-15)

| Change | Detail |
|--|--|
| Merged into **Banking & Liquidity** | Tabs: Undeposited receipts, Move money, Petty cash, Documents (only when flag ON) |
| Removed Advanced Accounting nav | No more Deposit Worksheet / Treasury Transfer / Petty Cash / Treasury Documents siblings |
| Legacy URLs | Redirect to `/accounting/banking?tab=…` |
| Enable gate | Settings → Tax → Enable Treasury Documents; tabs hidden when OFF |
| Bank Transfer modal | Explains it posts a liquidity document when flag ON; points to Move money for cash/MoMo |

Proof: `npx vitest run src/__tests__/banking-treasury-merge-proof.test.ts` · `npm run ci:treasury-fitness` (A-08)

## True duplicate (resolved)

| Operator saw | Reality | Status |
|--|--|--|
| Banking Deposits + Deposit Worksheet | Same page twice | **Merged** — Banking → Undeposited receipts |

## Partial overlaps (intent unchanged)

| Workflow | Recommendation |
|--|--|
| Banking Transfer vs Move money | Keep both; Banking owns bank books; Move money is cross-liquidity |
| Register bank deposit vs Move money | Keep register ops |
| Register petty vs Petty cash tab | Keep both; page owns FUND/REPLENISH |
| Customer deposits vs Undeposited receipts | Naming only — not the same |

## Unique value (keep)

Banking: statement import, reconcile, bank_transactions. Treasury docs: settlement ledger, immutability, shortage/overage. Register: till session discipline.

## Flag matrix

| Surface | Flag OFF | Flag ON |
|--|--|--|
| Banking liquidity tabs | Hidden | Visible under Banking |
| Banking Transfer | GL only | Shim + bank_transactions (+ copy explains TD) |
| Register bank/float/expense | Direct journals | Shim to TD |
