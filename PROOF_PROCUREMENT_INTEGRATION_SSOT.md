# PROOF — Procurement / AP integration SSOT

**Generated:** 2026-08-30T07:31:29.325Z  
**Verdict:** **PASS** (31/31)  
**Scope:** Cross-module SSOT: PO money, bill settlement, GR reverse≠billable, return next-step, dashboard refresh — shared modules + wiring + behavior

## Shared modules (SSOT)

- `shared/utils/pricingEngine.ts`
- `shared/utils/po-line-uom.ts`
- `shared/utils/supplierBillSettlement.ts`
- `shared/domain/supplierReturnWorklist.ts`
- `shared/domain/grnBillPromptSsot.ts`
- `shared/domain/grBillingStatusSsot.ts`
- `shared/domain/poReceiptWorkflowSsot.ts`

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `FILE_shared_utils_pricingEngine_ts` | PASS | shared/utils/pricingEngine.ts |
| `FILE_shared_utils_po-line-uom_ts` | PASS | shared/utils/po-line-uom.ts |
| `FILE_shared_utils_supplierBillSettlement_ts` | PASS | shared/utils/supplierBillSettlement.ts |
| `FILE_shared_utils_supplierBillCancelEligibility_ts` | PASS | shared/utils/supplierBillCancelEligibility.ts |
| `FILE_shared_domain_supplierReturnWorklist_ts` | PASS | shared/domain/supplierReturnWorklist.ts |
| `FILE_shared_domain_grnBillPromptSsot_ts` | PASS | shared/domain/grnBillPromptSsot.ts |
| `FILE_shared_domain_grBillingStatusSsot_ts` | PASS | shared/domain/grBillingStatusSsot.ts |
| `FILE_shared_domain_poReceiptWorkflowSsot_ts` | PASS | shared/domain/poReceiptWorkflowSsot.ts |
| `FILE_shared_sql_610_po_unit_price_precision_6dp_sql` | PASS | shared/sql/610_po_unit_price_precision_6dp.sql |
| `PE_ENGINE` | PASS | 6dp unit keeps 7000; 2dp truncate yields 7000.08 |
| `PO_PRESERVE_7000` | PASS | typed line total preserved across sync + save finalize |
| `CANCELLED_NEVER_PAID` | PASS | cancelled bill is Cancelled with 0 due — never Paid |
| `UNINVOICED_RETURN_DONE` | PASS | uninvoiced reverse → Done/Reversal complete — not Need bill |
| `INVOICED_RETURN_NEED_SCN` | PASS | invoiced return still needs SCN |
| `GR_LANE_REVERSED_BEATS_BILL` | PASS | reversed lane wins over sibling/bill number — never billable |
| `PO_REOPEN_AFTER_REVERSE` | PASS | full reverse → DRAFT workflow + Draft lane (manage again) |
| `WIRE_PO_CLIENT` | PASS | Purchase Orders UI uses po-line-uom SSOT |
| `WIRE_PO_SERVER` | PASS | PO service persists PE totals + 6dp unit |
| `WIRE_PO_DB_6DP` | PASS | DB unit_price scale ≥ 6 locked by migration + postcondition |
| `WIRE_BILL_SETTLEMENT` | PASS | supplier invoice UI uses settlement SSOT |
| `WIRE_DASHBOARD_REFRESH` | PASS | cancel/payment refreshes shared Outstanding cards |
| `WIRE_GR_NO_BILL_REVERSED` | PASS | reversed GR: historical posting copy; hide return/reassign; block rebill |
| `WIRE_GR_BILLING_LANE_SSOT` | PASS | list SQL + getById + badge share REVERSED-before-INVOICED lane |
| `WIRE_PO_RECEIPT_WORKFLOW` | PASS | PO UI + return post share poReceiptWorkflow sync/badge SSOT |
| `WIRE_RETURN_WORKLIST` | PASS | returns list SQL + UI share uninvoiced=COMPLETE rule |
| `SCRIPT_proof_po-total-ssot` | PASS | proof:po-total-ssot |
| `SCRIPT_proof_po-receipt-workflow-ssot` | PASS | proof:po-receipt-workflow-ssot |
| `SCRIPT_proof_grn-bill-prompt-defaults` | PASS | proof:grn-bill-prompt-defaults |
| `SCRIPT_proof_supplier-invoice-grn-bounds` | PASS | proof:supplier-invoice-grn-bounds |
| `SCRIPT_proof_supplier-bill-cancel` | PASS | proof:supplier-bill-cancel |
| `SCRIPT_proof_procurement-integration-ssot` | PASS | proof:procurement-integration-ssot |

## Companion proofs

```bash
npm run proof:procurement-integration-ssot
npm run proof:po-total-ssot
npm run proof:grn-bill-prompt-defaults
npm run proof:supplier-invoice-grn-bounds
npm run proof:supplier-bill-cancel
```
