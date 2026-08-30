# PROOF — PO receipt workflow SSOT

**Generated:** 2026-08-30T20:40:24.161Z  
**Verdict:** **PASS** (15/15)  
**Scope:** Full GR reverse → PO DRAFT (manage again); hide 0/N progress noise; sole sync + list heal

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `FILE_shared_domain_poReceiptWorkflowSsot_ts` | PASS | shared/domain/poReceiptWorkflowSsot.ts |
| `FILE_shared_utils_purchaseOrderReceiptDisplay_ts` | PASS | shared/utils/purchaseOrderReceiptDisplay.ts |
| `FILE_SamplePOS_Server_src_modules_purchase-orders_poReceiptStatusSync_ts` | PASS | SamplePOS.Server/src/modules/purchase-orders/poReceiptStatusSync.ts |
| `SYNC_FULL_REVERSE_TO_DRAFT` | PASS | full reverse: COMPLETED→DRAFT; PENDING stays (resubmit) unless event forces draft |
| `SYNC_COMPLETE_AND_PARTIAL` | PASS | full receive → COMPLETED; partial reopen → PENDING; CANCELLED/DRAFT untouched |
| `FULLY_REVERSED_HELPER` | PASS | full reverse detected; hide 0/N open progress noise |
| `LANE_DRAFT_AFTER_REVERSE` | PASS | UI shows Draft — not Reopened (reversed) |
| `LANE_AWAITING` | PASS | never-received stays Awaiting Receipt |
| `LANE_PARTIAL` | PASS | partial after return → Partially Received |
| `NO_REOPENED_LABEL` | PASS | no Reopened (reversed) operator noise |
| `WIRE_SYNC_TO_DRAFT` | PASS | sync writes DRAFT on reverse; list heal only COMPLETED (not PENDING) |
| `WIRE_LIST_HEALS` | PASS | PO list heals stuck COMPLETED; resubmit PENDING stays for Send |
| `WIRE_RETURN_USES_SYNC` | PASS | Return GRN post uses sync |
| `WIRE_GR_FINALIZE_USES_SYNC` | PASS | GR finalize uses sync |
| `WIRE_UI_DRAFT` | PASS | UI + domain: Draft after reverse, no REOPENED_REVERSED lane |
