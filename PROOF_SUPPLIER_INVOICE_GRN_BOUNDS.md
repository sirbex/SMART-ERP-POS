# PROOF — Supplier invoice ≤ GRN received value

**Verdict:** PASS
**Proven at:** 2026-08-26T18:02:48.808Z

**Contract:** GR-linked supplier invoices cannot exceed received billable value unless PRICE_VARIANCE; linked GRs must be COMPLETED with billable qty; postInvoiceToGL re-validates; manual GR-note bills blocked in UI

## Gates

- PASS `OVER_PV`: over-GRN + PRICE_VARIANCE ok
- PASS `OVER_NO_DISCOUNT`: over-GRN rejects SUPPLIER_DISCOUNT
- PASS `UNDER_NO_PV`: under-GRN rejects PRICE_VARIANCE
- PASS `MODULE`: validation module enforces GR ready + direction
- PASS `CREATE_WIRE`: createSupplierInvoice asserts linked GRs then validates variance
- PASS `FROM_GRN_WIRE`: createInvoiceFromGRN validates supplierReportedTotal
- PASS `POST_WIRE`: postInvoiceToGL re-validates before GL
- PASS `ROUTES`: API accepts varianceReason on create + from-grn
- PASS `UI_BLOCK_MANUAL_GR`: manual bill UI blocks GR-referenced notes
- PASS `UI_FROM_GRN`: GR billing UI uses from-grn + variance modal

## Reproduce

```bash
cd SamplePOS.Server && npx vitest run src/modules/supplier-payments/supplierInvoiceGrnValidation.test.ts src/modules/supplier-payments/supplierInvoiceGrnIntegrity.evidence.test.ts
npm run proof:supplier-invoice-grn-bounds
```
