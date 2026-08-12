# PROOF — Deposit application posting SSOT

**Generated:** 2026-08-12T14:11:31.288Z  
**Verdict:** **PASS** (21/21 gates)

## Why this proof exists

Completing a sale with **DEPOSIT** payment threw:

```
[GOV_RULE_E_RECEIPT_STRUCTURE] PAYMENT_RECEIPT must debit Undeposited Funds …
error_code: ERR_SALE_004
```

Root cause: liability clear journal (DR Customer Deposits / CR AR) was mis-tagged as **`PAYMENT_RECEIPT`**, which Rule E reserves for **cash→Undeposited Funds** hygiene.

## Permanent SSOT

| Step | Source | Debit | Credit |
|------|--------|-------|--------|
| Take customer deposit | `PAYMENT_RECEIPT` | Undeposited Funds (1015) | Customer Deposits (2200) |
| Apply deposit to sale/invoice | `DEPOSIT_APPLICATION` | Customer Deposits (2200) | Accounts Receivable (1200) |

Applying is **not** a cash receipt. Cash already hit Undeposited Funds when the deposit was taken.

## Guarantees locked by gates

1. **Bug reproduction stays red:** DR 2200 / CR AR under `PAYMENT_RECEIPT` → `GOV_RULE_E_RECEIPT_STRUCTURE`  
2. **Fixed path stays green:** same lines under `DEPOSIT_APPLICATION` → pass  
3. **Source code:** `recordDepositApplicationToGL` hard-codes `source: 'DEPOSIT_APPLICATION'` — never `PAYMENT_RECEIPT`  
4. **Take deposit** remains `PAYMENT_RECEIPT` + UF debit  
5. **Migration 597** appends `DEPOSIT_APPLICATION` to CoA AllowedSources  

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `MIGRATION_597_PRESENT` | PASS | 597_deposit_application_posting_source.sql |
| `MIGRATION_AR_1200` | PASS | AR allowedSources append |
| `SOURCE_TYPE_DECL` | PASS | PostingSource has DEPOSIT_APPLICATION |
| `RULE_E_DEPOSIT_APP_BLOCK` | PASS | Rule E deposit-application structure |
| `SKIP_RULE_B_FOR_DEPOSIT_APP` | PASS | Rule B skipped for structural Rule E path |
| `HAS_APPLY_FN` | PASS | recordDepositApplicationToGL exists |
| `APPLY_SOURCE_DEPOSIT_APPLICATION` | PASS | source: DEPOSIT_APPLICATION |
| `APPLY_NOT_PAYMENT_RECEIPT` | PASS | apply body must not use PAYMENT_RECEIPT |
| `APPLY_DR_2200` | PASS | debits customer deposits |
| `APPLY_CR_AR` | PASS | credits AR |
| `APPLY_DOC_NEVER_RECEIPT` | PASS | docs forbid PAYMENT_RECEIPT label |
| `TAKE_IS_PAYMENT_RECEIPT` | PASS | taking deposit stays PAYMENT_RECEIPT |
| `BUG_REPRO_FAILS` | PASS | got GOV_RULE_E_RECEIPT_STRUCTURE |
| `APPLY_PASSES` | PASS | null |
| `TAKE_DEPOSIT_OK` | PASS | DR UF / CR 2200 |
| `TAKE_STILL_STRICT` | PASS | non-UF receipt blocked |
| `APPLY_WRONG_CR_BLOCKED` | PASS | got GOV_RULE_E_DEPOSIT_APPLICATION_STRUCTURE |
| `JE_CONTRACT_SOURCE` | PASS | source: 'DEPOSIT_APPLICATION' as const |
| `JE_CONTRACT_ACCOUNTS` | PASS | lines: Customer Deposits then AR |
| `SALES_CALLS_APPLY_GL` | PASS | complete uses apply GL helper |
| `SALES_ERR_SALE_004` | PASS | deposit apply failures stay ERR_SALE_004 |

## Re-run

```bash
cd SamplePOS.Server
npm test -- --runInBand src/services/depositApplicationPostingSsot.evidence.test.ts
```

Deploy: apply `shared/sql/597_deposit_application_posting_source.sql` (tenant migrate).
