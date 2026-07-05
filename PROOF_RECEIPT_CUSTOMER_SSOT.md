# Receipt Customer SSOT — Proof

- **Date:** 2026-07-05T19:09:33.106Z

- **PASS** buildReceiptDataFromSale exported
- **PASS** buildReceiptDataFromCheckout exported
- **PASS** mergeSaleForReceipt exported
- **PASS** resolveReceiptCustomerFields exported
- **PASS** SaleForReceipt includes customerPhone
- **PASS** SaleForReceipt includes customerEmail
- **PASS** ReceiptData includes customerPhone
- **PASS** ReceiptData includes customerEmail
- **PASS** Shared renderReceiptCustomerHTML helper
- **PASS** Detailed format uses shared customer block
- **PASS** Compact format uses shared customer block
- **PASS** Sales reprint merges list + detail sale
- **PASS** POS imports checkout receipt builder
- **PASS** POS uses makePosReceiptData wrapper
- **PASS** POS has no inline setReceiptData object literals
- **PASS** getSaleById joins customer phone
- **PASS** getSaleById joins customer email
- **PASS** PDF receipt uses customerMetaRows helper
- **PASS** SUNMI ReceiptData includes customerPhone
- **PASS** SUNMI ReceiptData includes customerEmail
- **PASS** vitest receipt-reprint.spec.ts
- **PASS** All 6 receipt parity tests passed — Tests  6 passed
- **PASS** Merge + HTML wiring covered by receipt-reprint.spec.ts (6 tests) — see Gate 2 vitest run

## Summary

- **Passed:** 23
- **Failed:** 0

**RESULT: PASS**

## Scope

- SSOT builder: `samplepos.client/src/lib/receiptFromSale.ts`
- Render: `samplepos.client/src/lib/print.ts` → `renderReceiptCustomerHTML`
- Reprint: `SalesPage` → `mergeSaleForReceipt(sale, saleDetails)`
- Checkout: `POSPage` → `makePosReceiptData` → `buildReceiptDataFromCheckout`
- API: `salesRepository.getSaleById` joins `customers.phone` and `customers.email`