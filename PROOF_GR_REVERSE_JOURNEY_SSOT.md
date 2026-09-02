# PROOF — GR reverse journey SSOT

**Generated:** 2026-09-02T18:19:44.454Z  
**Verdict:** **PASS** (29/29)  
**Scope:** Cross-surface GR reverse: paid/consumed block, PO Draft then Pending sticks, reversed UI, no SCN on full reverse, no sibling bill lookup, unique More nav keys

## Gates
- PASS `FILE_shared_domain_grFullReverseSsot_ts` — shared/domain/grFullReverseSsot.ts
- PASS `FILE_shared_domain_poReceiptWorkflowSsot_ts` — shared/domain/poReceiptWorkflowSsot.ts
- PASS `FILE_shared_domain_grBillingStatusSsot_ts` — shared/domain/grBillingStatusSsot.ts
- PASS `FILE_shared_domain_supplierReturnWorklist_ts` — shared/domain/supplierReturnWorklist.ts
- PASS `FILE_SamplePOS_Server_src_modules_purchase-orders_poReceiptStatusSync_ts` — SamplePOS.Server/src/modules/purchase-orders/poReceiptStatusSync.ts
- PASS `FILE_SamplePOS_Server_src_modules_return-grn_returnGrnService_ts` — SamplePOS.Server/src/modules/return-grn/returnGrnService.ts
- PASS `FILE_samplepos_client_src_pages_inventory_GoodsReceiptsPage_tsx` — samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx
- PASS `FILE_samplepos_client_src_components_inventory_GrReceiptStatusBadge_tsx` — samplepos.client/src/components/inventory/GrReceiptStatusBadge.tsx
- PASS `FILE_samplepos_client_src_components_InventoryLayout_tsx` — samplepos.client/src/components/InventoryLayout.tsx
- PASS `BEH_UNPAID_BILL_CANCEL_OK` — unpaid linked bill may auto-cancel on full reverse
- PASS `BEH_PAID_BILL_BLOCKS_REVERSE` — paid/partial bill blocks full reverse — no silent unallocate
- PASS `BEH_PO_REVERSE_TO_DRAFT` — COMPLETED→DRAFT on reverse; PENDING not yanked (resubmit sticks)
- PASS `BEH_PO_FULLY_REVERSED_PROGRESS` — net≈0 with GR history detects full reverse
- PASS `BEH_FINALIZE_ONLY_PENDING_PO` — Finalize GR only when PO is PENDING — Draft after reverse is blocked
- PASS `BEH_REVERSED_GR_NOT_BILLABLE` — reversed GR never billable even with sibling bill number
- PASS `BEH_FULL_REVERSE_NO_SCN_BUTTON` — full/uninvoiced reverse: Done — never Create Credit Note despite sibling bill flag
- PASS `BEH_INVOICED_RETURN_STILL_NEED_SCN` — normal invoiced return still offers SCN
- PASS `WIRE_REVERSED_GR_UI` — reversed detail: historical posting + Completed/Reversed badge; actions gated
- PASS `WIRE_HEAL_NOT_PENDING` — list heal COMPLETED only; getPOById read-only; return/reverse force draft
- PASS `WIRE_BILL_DIRECT_GR_ONLY` — bill/SCN attribution is this-GR only; billable qty nets returns; reversed blocked
- PASS `WIRE_FINALIZE_REQUIRES_PENDING_PO` — UI + server: Finalize blocked unless PO PENDING (Draft after reverse is not receivable)
- PASS `WIRE_PO_DELETE_AFTER_REVERSE` — Draft PO delete/cancel allowed when only reversed/cancelled GRs remain (audit kept)
- PASS `WIRE_SCN_FULL_REVERSE_BLOCK` — server + UI block SCN on full reverse / reversed GR
- PASS `WIRE_PAID_AND_CONSUMED_BLOCK` — eligibility shares paid-bill + consumed-stock reverse blocks
- PASS `WIRE_MORE_NAV_UNIQUE_KEYS` — overflow primary tabs use distinct key from More→operations group
- PASS `SCRIPT_proof_gr-reverse-journey-ssot` — proof:gr-reverse-journey-ssot
- PASS `SCRIPT_proof_po-receipt-workflow-ssot` — proof:po-receipt-workflow-ssot
- PASS `SCRIPT_proof_procurement-integration-ssot` — proof:procurement-integration-ssot
- PASS `SCRIPT_proof_gr-full-reverse_live` — proof:gr-full-reverse:live
