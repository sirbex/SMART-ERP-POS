# DocumentTax — Production Certification Proof Run

Run: 2026-08-06T21:36:09.810Z

Mode: foundation

Charter: [PROOF_DOCUMENT_TAX_CHARTER.md](./PROOF_DOCUMENT_TAX_CHARTER.md)


## Gate A — Architecture (Jest evidence)

- **PASS** A-document-tax-evidence-matrix — 101 tests class
- **PASS** A-phases-e2e-evidence — 24 executable pipeline cases
- **PASS** A-PM-price-mode-integrity — exclusive/inclusive contract + SALE-2026-0179 seal
- **PASS** A-PV-product-vat-untick-integrity — is_taxable=false beats mapping on retail computeForLines

## Gates B–C — Live PostgreSQL mutations

- **PASS** B-database-reachable
- **PASS** B-C-live-mutation-cert — live tsx exit 0

### Live lane stdout (tail)

```
thout customer_id — AT_COST and credit invoicing will not apply[39m
2026-08-07 00:36:39 [[32minfo[39m]: [32mUoM conversion resolved (canonical SSOT)[39m
2026-08-07 00:36:39 [[33mwarn[39m]: [33mDocumentTaxService: client tax preview overridden by server[39m
2026-08-07 00:36:39 [[32minfo[39m]: [32mDocumentTaxService createSale tax[39m
2026-08-07 00:36:39 [[32minfo[39m]: [32m💰 FINAL TOTAL AMOUNT[39m
2026-08-07 00:36:39 [[32minfo[39m]: [32mPayment breakdown calculated[39m
2026-08-07 00:36:39 [[32minfo[39m]: [32mSkipping inventory deduction for service item[39m
2026-08-07 00:36:39 [[32minfo[39m]: [32mSale revenue breakdown[39m
2026-08-07 00:36:39 [[32minfo[39m]: [32mJournal entry created[39m
2026-08-07 00:36:39 [[32minfo[39m]: [32mRecorded sale to GL[39m
2026-08-07 00:36:39 [[33mwarn[39m]: [33mCash sale without register session - drawer tracking will be incomplete[39m
- **PASS** B-U-createSale — saleId=1599b313-01a6-4037-a488-ce367fc38d42
  PASS  B-U-createSale — saleId=1599b313-01a6-4037-a488-ce367fc38d42
- **PASS** B-U-sale-header-tax-zero — 0
  PASS  B-U-sale-header-tax-zero — 0
- **PASS** B-U-sale-total-shell — 20000
  PASS  B-U-sale-total-shell — 20000
- **PASS** B-U-line-tax-zero — 0
  PASS  B-U-line-tax-zero — 0
- **PASS** B-U-line-determination-NONE — NONE
  PASS  B-U-line-determination-NONE — NONE

## Deferred / out of scope this run

- **SKIP** D-restaurant-order — HTTP FOH settle lane — use proof:order-complete-soak:live
  SKIP  D-restaurant-order — HTTP FOH settle lane — use proof:order-complete-soak:live
- **SKIP** D-quotation-convert — use proof:quotation-invoice-pdf:live
  SKIP  D-quotation-convert — use proof:quotation-invoice-pdf:live
- **SKIP** D-offline-replay — requires offline queue fixture
  SKIP  D-offline-replay — requires offline queue fixture
- **SKIP** D-phase-8b-multi-rate-gl — deferred — single CR 2300 still intentional
  SKIP  D-phase-8b-multi-rate-gl — deferred — single CR 2300 still intentional
- **SKIP** D-perf-p50-p99 — benchmark not in this mutation cert
  SKIP  D-perf-p50-p99 — benchmark not in this mutation cert
- **PASS** Z-fixtures-restored
  PASS  Z-fixtures-restored

## Summary

PASS: 41  FAIL: 0  SKIP: 5

**Verdict:** CERTIFIED (live mutation lane)

════════════════════════════════════════════════════════════
 wrote C:\Users\Chase\source\repos\SamplePOS\PROOF_DOCUMENT_TAX_LIVE_LANE.md
 PASS=41 FAIL=0 SKIP=5
════════════════════════════════════════════════════════════

```


## Gate D — Deferred lanes

- **SKIP** D-restaurant-http — use proof:order-complete-soak:live
- **SKIP** D-quotation-convert-http — use proof:quotation-invoice-pdf:live
- **SKIP** D-offline-replay — requires offline queue fixture
- **SKIP** D-phase-8b-multi-rate-gl — deferred by design
- **SKIP** D-perf-benchmark — p50/p95/p99 not yet instrumented

## Gate E — Governance

- **PASS** E-schema-version-584plus
- **PASS** E-migration-584-file

## Gate verdicts

- Gate A: **PASS**
- Gate B: **PASS**
- Gate C: **PASS**
- Gate D: **SKIP**
- Gate E: **PASS**

PASS: 8  FAIL: 0  SKIP: 5


**Verdict:** CERTIFIED (foundation + live)

