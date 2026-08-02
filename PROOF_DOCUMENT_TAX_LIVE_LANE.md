# DocumentTax — Production Certification (LIVE PostgreSQL)

Run: 2026-08-02T20:31:07.276Z
Database: postgresql://postgres:***@localhost:5432/pos_system


## Gate B — Live schema & fixtures

- **PASS** B-schema-584-sale-items — tax_amount,tax_rate,is_taxable,tax_determination
- **PASS** B-settings-loaded
- **PASS** B-product-fixture — matooke with beans type=service price=20000
- **PASS** B-soldBy-user — 7aa55a55-db98-4a9d-a743-d877c7d8dd21
- **PASS** B-fixtures-exclusive-tax-lane — tax_inclusive=false, product taxable@18%

## Gate B — DocumentTaxService live determination

- **PASS** B-determination-BRIDGE — BRIDGE
- **PASS** B-tax-amount — got 7200 expected ~7200

## Gate B — createSale persist + GL

- **PASS** B-createSale — saleId=d8b33dfb-d6eb-4081-b30f-d1749efb0285 number=SALE-2026-0165
- **PASS** B-sale-header-tax — 7200
- **PASS** B-sale-items-count — 1
- **PASS** B-sale-item-tax-amount — 7200
- **PASS** B-sale-item-tax-rate — 18
- **PASS** B-sale-item-determination — BRIDGE
- **PASS** B-header-equals-line-tax
- **PASS** B-gl-cr-2300 — credit=7200 rows=3

## Gate C — Invoice copy + remittance

- **PASS** C-createInvoice — 221b0ed9-228c-404e-a681-c39311b864e8
- **PASS** C-invoice-lines-copied
- **PASS** C-invoice-line-tax — 7200
- **PASS** C-remittance-no-double-count — reportRows=2

## Gate C — Partial return remittance netting

- **PASS** C-partial-refund
- **PASS** C-partial-return-tax-net — net=3600 expected~3600

## Gate C — Credit note DocumentTax line tax

- **PASS** C-credit-note-line-tax — got 3600 expected 3600
- **PASS** C-credit-note-created — dfd6682f-4059-4c22-aef5-9c5c08af849a

## Deferred / out of scope this run

- **SKIP** D-restaurant-order — HTTP FOH settle lane — use proof:order-complete-soak:live
- **SKIP** D-quotation-convert — use proof:quotation-invoice-pdf:live
- **SKIP** D-offline-replay — requires offline queue fixture
- **SKIP** D-phase-8b-multi-rate-gl — deferred — single CR 2300 still intentional
- **SKIP** D-perf-p50-p99 — benchmark not in this mutation cert
- **PASS** Z-fixtures-restored

## Summary

PASS: 24  FAIL: 0  SKIP: 5

**Verdict:** CERTIFIED (live mutation lane)

