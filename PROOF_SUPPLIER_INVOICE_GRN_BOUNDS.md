# PROOF — Supplier invoice ≤ GRN received value

**Verdict:** PASS
**Proven at:** 2026-08-30T20:40:20.476Z

**Contract:** GR-linked supplier invoices cannot exceed PricingEngine billable total; one SSOT path for validation, billing, GL, and UI preview; linked GRs must be COMPLETED with billable qty

## Gates

- PASS `OVER_NO_PV`: over-GRN rejects even with PRICE_VARIANCE
- PASS `OVER_NO_DISCOUNT`: over-GRN rejects SUPPLIER_DISCOUNT
- PASS `UNDER_NO_PV`: under-GRN rejects PRICE_VARIANCE
- PASS `MODULE`: validation module enforces GR ready + PricingEngine SSOT + no over-billing AP
- PASS `CREATE_WIRE`: createSupplierInvoice asserts linked GRs then validates variance
- PASS `FROM_GRN_WIRE`: createInvoiceFromGRN validates supplierReportedTotal
- PASS `POST_WIRE`: postInvoiceToGL re-validates before GL
- PASS `ROUTES`: API: from-grn + billable-total preview + varianceReason
- PASS `ROUTES_CANCEL`: cancel unpaid bill route + service wired
- PASS `BLOCK_BILL_REVERSED_GR`: UI + from-grn block Create Supplier Bill after reverse
- PASS `FULL_REVERSE_AUTO_CANCEL_BILLS`: Full reverse: unpaid cancel OK; paid + consumed blocked
- PASS `UI_CANCEL_BILL`: Supplier Payments cancel bill button gated
- PASS `CANCEL_SSOT`: Cancel eligibility shared SSOT + server pre-checks
- PASS `UI_BLOCK_MANUAL_GR`: manual bill UI blocks GR-referenced notes
- PASS `UI_FROM_GRN`: GR billing UI uses server billable total + blocks bill > received value

## Reproduce

```bash
cd SamplePOS.Server && npx vitest run src/modules/supplier-payments/supplierInvoiceGrnValidation.test.ts src/modules/supplier-payments/supplierInvoiceGrnIntegrity.evidence.test.ts
npm run proof:supplier-invoice-grn-bounds
```
