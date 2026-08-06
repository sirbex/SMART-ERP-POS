# DocumentTax — Production Certification (LIVE PostgreSQL)

Run: 2026-08-06T21:36:34.296Z
Database: postgresql://postgres:***@localhost:5432/pos_system?schema=public


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

- **PASS** B-createSale — saleId=4b9be91a-31a2-4979-9148-7641be8e4a53 number=SALE-2026-0201
- **PASS** B-sale-header-tax — 7200
- **PASS** B-sale-items-count — 1
- **PASS** B-sale-item-tax-amount — 7200
- **PASS** B-sale-item-tax-rate — 18
- **PASS** B-sale-item-determination — BRIDGE
- **PASS** B-header-equals-line-tax
- **PASS** B-gl-cr-2300 — credit=7200 rows=3

## Gate C — Invoice copy + remittance

- **PASS** C-createInvoice — 28dd78c5-35a6-46bd-99d9-38ed35857eb7
- **PASS** C-invoice-lines-copied
- **PASS** C-invoice-line-tax — 7200
- **PASS** C-remittance-no-double-count — reportRows=2

## Gate C — Partial return remittance netting

- **PASS** C-partial-refund
- **PASS** C-partial-return-tax-net — net=3600 expected~3600

## Gate C — Credit note DocumentTax line tax

- **PASS** C-credit-note-line-tax — got 3600 expected 3600
- **PASS** C-credit-note-created — 57e68e05-8661-487c-8207-04fdf2a0c78c

## Gate B-I — Inclusive price mode (extract VAT, charge = shelf)

- **PASS** B-I-settings-inclusive — true
- **PASS** B-I-not-DISABLED — BRIDGE
- **PASS** B-I-extracted-tax — got 3050.85 expected ~3050.85
- **PASS** B-I-charge-equals-shelf — got 20000 shelf 20000
- **PASS** B-I-createSale — saleId=a0198477-1717-4ba4-a9d6-e774ca408e55 number=SALE-2026-0202
- **PASS** B-I-sale-header-tax — 3050.85
- **PASS** B-I-sale-total-equals-shelf — 20000
- **PASS** B-I-line-not-DISABLED — BRIDGE
- **PASS** B-I-line-tax-amount — 3050.85
- **PASS** B-I-gl-cr-2300 — 3050.85

## Gate B-U — Product VAT untick (is_taxable=false → tax 0 on retail)

- **PASS** B-U-determination-NONE — NONE
- **PASS** B-U-tax-zero — 0
- **PASS** B-U-createSale — saleId=1599b313-01a6-4037-a488-ce367fc38d42
- **PASS** B-U-sale-header-tax-zero — 0
- **PASS** B-U-sale-total-shell — 20000
- **PASS** B-U-line-tax-zero — 0
- **PASS** B-U-line-determination-NONE — NONE

## Deferred / out of scope this run

- **SKIP** D-restaurant-order — HTTP FOH settle lane — use proof:order-complete-soak:live
- **SKIP** D-quotation-convert — use proof:quotation-invoice-pdf:live
- **SKIP** D-offline-replay — requires offline queue fixture
- **SKIP** D-phase-8b-multi-rate-gl — deferred — single CR 2300 still intentional
- **SKIP** D-perf-p50-p99 — benchmark not in this mutation cert
- **PASS** Z-fixtures-restored

## Summary

PASS: 41  FAIL: 0  SKIP: 5

**Verdict:** CERTIFIED (live mutation lane)

