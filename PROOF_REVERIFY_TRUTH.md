# PROOF — Re-verify (truth only)

**Generated:** 2026-08-10T22:19:45Z (UTC)  
**Scope:** Structural + unit evidence only. **No live tenant write / order-complete browser E2E claimed.**

## Verdict: ALL RE-RUN EVIDENCE PASSED

| Suite | Command surface | Result | Gate/tests |
|-------|-----------------|--------|------------|
| Deposit application posting SSOT | `depositApplicationPostingSsot.evidence.test.ts` | **PASS** | **21/21** gates |
| Customer identity SSOT (deposits + store credits) | `customer-deposit-identity-ssot.evidence.test.ts` | **PASS** | **30/30** gates |
| Aged balance integrity | `agedBalanceIntegrity.evidence.test.ts` | **PASS** | **19/19** gates |
| PG domain enum integrity | `pgDomainEnumIntegrity.evidence.test.ts` | **PASS** | **16/16** gates |
| Governance + GL deposit accuracy (matched suites) | Jest batch | **PASS** | **135** tests in matched run |

## Truth claims (verified against current tree)

### A. Deposit apply cannot re-use cash-receipt source

| Claim | Truth |
|-------|--------|
| `recordDepositApplicationToGL` source | **`DEPOSIT_APPLICATION` only** (source scan / accuracy test) |
| Same JE as production bug (DR 2200 / CR AR @ 99120) under `PAYMENT_RECEIPT` | Still **fails** `GOV_RULE_E_RECEIPT_STRUCTURE` (intentional regression lock) |
| Same JE under `DEPOSIT_APPLICATION` | **Passes** governance |
| Take deposit cash | Still **`PAYMENT_RECEIPT`** + DR Undeposited Funds |

Artifacts: `PROOF_DEPOSIT_APPLICATION_POSTING_SSOT.md` / `.json`

### B. Customer money UI identity is not list-page-1

| Claim | Truth |
|-------|--------|
| `CustomerDeposits.tsx` + `StoreCredits.tsx` | **No** `customers.find` save gate |
| Save requires | Non-empty **customer UUID** (`canActOnCustomerId` / `canPostCustomerDeposit`) |
| Name SSOT | Bound prop + `useCustomer` (list = browse only) |
| Detail mounts | Pass `customerName` to deposits and store credits |
| Domain | `appliesTo: CustomerDeposits, StoreCredits` |

Artifacts: `PROOF_CUSTOMER_DEPOSIT_IDENTITY_SSOT.md` / `.json`

### C. Aged receivables SQL is enum-safe

| Claim | Truth |
|-------|--------|
| `payment_method` filter | Via `::text` — **not** `COALESCE(enum, '')` |
| Credit method | **`CREDIT` only** (schema label; not invented ON_ACCOUNT/CHARGE) |

Artifacts: `PROOF_AGED_BALANCE_INTEGRITY.md` / `.json`  
Also: `PROOF_PG_DOMAIN_ENUM_INTEGRITY.md` / `.json` (incl. coalesce-empty ban)

### D. GRIR TS2352 (type check)

| Claim | Truth |
|-------|--------|
| Prior error | `rest as GrirOpenItemRow` from `Record` → **TS2352** |
| Current code | `rest as unknown as GrirOpenItemRow` at map boundary |
| Meaning | Type compile boundary only — **not** a GL/money proof for GR/IR clearings |

## Explicit non-claims (do not invent)

- Live POS order complete with deposit payment against tenant DB was **not** re-executed in this re-verify.  
- Uncommitted GRIR F.13 / tax / session workspace files are **out of scope** of the tables above unless suite names list them.  
- Store credits remain a **localStorage prototype** for ledger; identity SSOT on UI is proven — backend GL for store credits is not claimed here.  
- Pre-commit AP cache-vs-open-item drift note (if seen earlier) is **tenant data**, not covered by these structural gates.

## How to re-run (reproduce this truth)

```bash
cd SamplePOS.Server
npm test -- --runInBand src/services/depositApplicationPostingSsot.evidence.test.ts
npm test -- --runInBand src/services/agedBalanceIntegrity.evidence.test.ts
npm test -- --runInBand src/tests/pgDomainEnumIntegrity.evidence.test.ts

cd ../samplepos.client
npx vitest run src/__tests__/customer-deposit-identity-ssot.evidence.test.ts
```

## Source of truth files (code)

| Area | Path |
|------|------|
| Apply deposit GL | `SamplePOS.Server/src/services/glEntryService.ts` → `recordDepositApplicationToGL` |
| Rule E | `SamplePOS.Server/src/services/postingGovernanceService.ts` |
| Identity SSOT helpers | `shared/domain/customerDepositSsot.ts` |
| Deposits UI | `samplepos.client/src/components/customers/CustomerDeposits.tsx` |
| Store credits UI | `samplepos.client/src/components/customers/StoreCredits.tsx` |
| Aging AR credit sales | `SamplePOS.Server/src/services/agedBalanceService.ts` |
| CoA migration | `shared/sql/597_deposit_application_posting_source.sql` |
