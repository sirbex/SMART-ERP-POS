# DocumentTax — Production Certification Proof Run

Run: 2026-08-02T20:30:54.634Z

Mode: foundation

Charter: [PROOF_DOCUMENT_TAX_CHARTER.md](./PROOF_DOCUMENT_TAX_CHARTER.md)


## Gate A — Architecture (Jest evidence)

- **PASS** A-document-tax-evidence-matrix — 101 tests class
- **PASS** A-phases-e2e-evidence — 24 executable pipeline cases

## Gates B–C — Live PostgreSQL mutations

- **PASS** B-database-reachable
- **PASS** B-C-live-mutation-cert — live tsx exit 0

### Live lane stdout (tail)

```
 C-invoice-lines-copied
- **PASS** C-invoice-line-tax — 7200
  PASS  C-invoice-line-tax — 7200
- **PASS** C-remittance-no-double-count — reportRows=2
  PASS  C-remittance-no-double-count — reportRows=2

## Gate C — Partial return remittance netting

2026-08-02 23:31:19 [[32minfo[39m]: [32mRefund document created[39m
2026-08-02 23:31:19 [[32minfo[39m]: [32mJournal entry created[39m
2026-08-02 23:31:19 [[32minfo[39m]: [32mRecorded sale refund to GL[39m
2026-08-02 23:31:19 [[32minfo[39m]: [32mSale partially returned — status changed to PARTIALLY_RETURNED[39m
2026-08-02 23:31:19 [[32minfo[39m]: [32mSale return completed successfully[39m
2026-08-02 23:31:19 [[32minfo[39m]: [32mCash movement recorded[39m
2026-08-02 23:31:19 [[32minfo[39m]: [32mCash register refund movement recorded[39m
- **PASS** C-partial-refund
  PASS  C-partial-refund
- **PASS** C-partial-return-tax-net — net=3600 expected~3600
  PASS  C-partial-return-tax-net — net=3600 expected~3600

## Gate C — Credit note DocumentTax line tax

2026-08-02 23:31:19 [[32minfo[39m]: [32mCredit note draft created[39m
- **PASS** C-credit-note-line-tax — got 3600 expected 3600
  PASS  C-credit-note-line-tax — got 3600 expected 3600
- **PASS** C-credit-note-created — dfd6682f-4059-4c22-aef5-9c5c08af849a
  PASS  C-credit-note-created — dfd6682f-4059-4c22-aef5-9c5c08af849a

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

PASS: 24  FAIL: 0  SKIP: 5

**Verdict:** CERTIFIED (live mutation lane)

════════════════════════════════════════════════════════════
 wrote C:\Users\Chase\source\repos\SamplePOS\PROOF_DOCUMENT_TAX_LIVE_LANE.md
 PASS=24 FAIL=0 SKIP=5
════════════════════════════════════════════════════════════

```


## Gate D — Deferred lanes

- **SKIP** D-restaurant-http — use proof:order-complete-soak:live
- **SKIP** D-quotation-convert-http — use proof:quotation-invoice-pdf:live
- **SKIP** D-offline-replay — requires offline queue fixture
- **SKIP** D-phase-8b-multi-rate-gl — deferred by design
- **SKIP** D-perf-benchmark — p50/p95/p99 not yet instrumented

## Gate E — Governance

- **PASS** E-schema-version-584
- **PASS** E-migration-584-file

## Gate verdicts

- Gate A: **PASS**
- Gate B: **PASS**
- Gate C: **PASS**
- Gate D: **SKIP**
- Gate E: **PASS**

PASS: 6  FAIL: 0  SKIP: 5


**Verdict:** CERTIFIED (foundation + live)

