# Banking ↔ Treasury UX Merge — Proof

Run: 2026-07-15

## What changed

Liquidity workflows are no longer four sibling Advanced Accounting pages. They live under **Banking & Liquidity** when Treasury Documents are enabled.

| Old (duplicate) | New |
|--|--|
| Advanced → Deposit Worksheet | Banking → Undeposited receipts |
| Advanced → Treasury Transfer | Banking → Move money |
| Advanced → Petty Cash | Banking → Petty cash |
| Advanced → Treasury Documents | Banking → Documents |
| Banking → Deposits (same page twice) | Removed duplicate label |

Legacy URLs redirect to `/accounting/banking?tab=…`.

## Evidence

```
ci:treasury-fitness → PASS (A-07 Settings gate, A-08 Banking merge)
Jest treasurySettingsAdminUiProof → 7 passed
Vitest banking-treasury-merge-proof → 5 passed
Vitest treasury-transfer-flow-proof → 3 passed
Vitest treasury-settings-enable-proof → 3 passed
```

**Overall: PASS**
