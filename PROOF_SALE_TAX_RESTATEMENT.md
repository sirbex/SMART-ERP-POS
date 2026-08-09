# PROOF — Sale tax restatement (omitted VAT)

**Generated (COMMIT execute):** 2026-08-09T11:11:56.592Z  
**Verdict:** **PASS** (29/29 live gates)  
**Jest structural:** **PASS** (9/9) — `saleTaxRestatement.evidence.test.ts`  
**Execute mode:** COMMIT (`PROOF_TAX_RESTATE_EXECUTE=1`)  
**Sale:** `a0530882-bd1b-4917-b562-9ab1bd751665` · **SALE-2026-0208** · **INV-2026-0001**

> Only gates that were **executed** appear below. No gate is marked PASS without a runtime check.  
> Policy SSOT: [PROOF_TAX_CORRECTION_SMART_MODEL.md](./PROOF_TAX_CORRECTION_SMART_MODEL.md)

## Measured outcome (commit)

| Field | Before | After |
|-------|--------|-------|
| Sale tax | 0 | **43,200** |
| Sale total | 260,000 | **303,200** |
| Invoice tax | 0 | **43,200** |
| Invoice due | 260,000 | **303,200** |
| Customer balance | (prior) | **303,200** |
| GL | — | **DR 1200 / CR 2300 = 43,200** (balanced) |
| Event | — | `a8c1f96b-1060-4529-85b1-faa98adc7f8a` |
| GL txn | — | `46125664-6161-404f-ab35-702fabd16f1b` |

## Live gates (COMMIT run)

| Gate | Result | Detail |
|------|--------|--------|
| `MIG_594` | PASS | sale_tax_restatement migration applied (IF NOT EXISTS) |
| `SSOT_MODEL_DOC` | PASS | smart model proof doc present with key terms |
| `SVC_PATH` | PASS | service recomputes via DocumentTaxService |
| `ROUTES` | PASS | API routes tax-restatement execute present |
| `PERM` | PASS | RBAC catalog key sales.tax_restatement |
| `UI` | PASS | Sales UI wires SaleTaxRestatementModal |
| `SALE_PICK` | PASS | saleId=a0530882-bd1b-4917-b562-9ab1bd751665 |
| `PREVIEW_NO_FATAL` | PASS | preview OK taxDelta=43200 |
| `DELTA_POSITIVE` | PASS | taxDelta=43200 |
| `NEW_GT_POSTED` | PASS | newTax=43200 postedTax=0 |
| `JOURNAL_BALANCED` | PASS | DR 1200 43200 / CR 2300 43200 |
| `EXCL_TOTAL_DELTA` | PASS | totalDelta=43200 taxDelta=43200 |
| `EXCL_GL_AR_TAX` | PASS | exclusive: DR 1200 + CR 2300 |
| `LINE_SUM` | PASS | line newTax sum matches header newTax |
| `DOCTYPE_PARITY` | PASS | DocumentTax 43200 vs preview 43200 |
| `EXECUTE_USER` | PASS | userId present |
| `EXECUTE_OK` | PASS | event + gl ids written |
| `SALE_TAX_STAMPED` | PASS | sales.tax_amount=43200 |
| `SALE_TOTAL_STAMPED` | PASS | sales.total_amount=303200 |
| `LINE_HEADER_MATCH` | PASS | sum(line tax)=43200 |
| `INV_TAX_INV-2026-0001` | PASS | tax=43200 |
| `INV_DUE_INV-2026-0001` | PASS | due=303200 |
| `GL_JE_BALANCED` | PASS | dr=43200 cr=43200 |
| `GL_TAX_CR` | PASS | correction JE credits 2300 |
| `AUDIT_EVENT` | PASS | event tax_delta=43200 |
| `IDEMPOTENT_PREVIEW` | PASS | second preview blocked (tax already correct) |
| `CUSTOMER_BALANCE_NUM` | PASS | customer.balance=303200 |
| `POLICY_INCREASE_ONLY` | PASS | increase-only + CN for reductions |
| `POLICY_NO_VOID` | PASS | no voidSale |

## Jest structural (9/9 PASS)

```
npm test -- --runInBand src/modules/corrections/saleTaxRestatement.evidence.test.ts
```

Covers: migration, permission, routes, DocumentTax+GL policy, repository, zod, UI, smart model doc, live script.

## Integrity model (proven on this run)

1. DocumentTax recompute (product bridge + customer) is tax SSOT for correction.  
2. Exclusive VAT: total += tax delta; GL DR AR 1200 / CR Tax 2300.  
3. Invoice restamped (tax, total, amount_due); lines refreshed.  
4. Increase-only; re-run blocked after success.  
5. No void of posted sale.  
6. Audit event + balanced journal.

## Re-run

```bash
cd SamplePOS.Server
# Structural only:
npm test -- --runInBand src/modules/corrections/saleTaxRestatement.evidence.test.ts

# Live preview (post-fix: expects ALREADY / tax match):
npx tsx scripts/proof-sale-tax-restatement-live.ts

# Live COMMIT (needs a sale with omitted VAT still):
# set PROOF_TAX_RESTATE_EXECUTE=1
# optional: PROOF_TAX_RESTATE_SALE_ID=<uuid>
npx tsx scripts/proof-sale-tax-restatement-live.ts
```

Machine JSON from last script run may be preview-only if execute is not set; **this markdown records the completed COMMIT proof** above.
