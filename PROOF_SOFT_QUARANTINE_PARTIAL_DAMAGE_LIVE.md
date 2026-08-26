# PROOF — Soft quarantine partial damage (LIVE functional)

**Verdict:** PASS
**Proven at:** 2026-08-25T23:52:29.351Z
**Stamp / SKU:** 20260825235227 / SQPD-20260825235227

**Contract:** Functional LIVE: partial soft quarantine splits lot; parent stays sellable; child quarantined without GL; dispose posts 5120; calendar-expired EXPIRED dispose posts 5130; full-batch path still status-only

## Fixture

```json
{
  "productId": "3f1e3960-f50c-402e-8d76-642bb9ca4569",
  "parentBatchId": "2510ca8a-58b8-4593-865c-416367658b80",
  "childBatchId": "09ccbb99-7bf8-464f-9109-1154ed4ba760",
  "fullBatchId": "caf53ed7-f1da-44c7-82a1-a73b611fd1a6",
  "expiredBatchId": "b9af9d53-d695-4a3c-bd9f-afbbdeda7e2d",
  "parentQty": 100,
  "partialQty": 12,
  "fullQty": 5,
  "expiredQty": 20,
  "expiryPast": "2026-08-24",
  "unitCost": 1000
}
```

## Gates (measured)

- PASS `MIG_609`: inventory_batches.parent_lot_id present
- PASS `MODE_SINGLE_STORE`: is_multistore_enabled=false (soft quarantine mode)
- PASS `USER`: userId=7aa55a55-db98-4a9d-a743-d877c7d8dd21
- PASS `GL_ACCOUNTS`: accounts present: 1300,5120
- PASS `SEED_PRODUCT`: productId=3f1e3960-f50c-402e-8d76-642bb9ca4569 sku=SQPD-20260825235227
- PASS `SEED_BATCHES`: seeded parent=100 full=5 expired=20 expiry=2026-08-24
  - measured: `{"rows":[{"id":"2510ca8a-58b8-4593-865c-416367658b80","batch_number":"SQPD-20260825235227-P","remaining_quantity":"100.0000","status":"ACTIVE","expiry_date":null},{"id":"caf53ed7-f1da-44c7-82a1-a73b611fd1a6","batch_number":"SQPD-20260825235`
- PASS `SVC_PARTIAL_SPLIT`: splitFrom=2510ca8a-58b8-4593-865c-416367658b80 child=09ccbb99-7bf8-464f-9109-1154ed4ba760 held=12
  - measured: `{"soft":{"inventoryBatchId":"09ccbb99-7bf8-464f-9109-1154ed4ba760","productLotId":"2248161b-065d-4e07-82e7-e43d60061dc0","productId":"3f1e3960-f50c-402e-8d76-642bb9ca4569","statusApplied":"QUARANTINED","quantityHeld":12,"remainingUnchanged"`
- PASS `SVC_QTY_HELD`: quantityHeld=12 expected=12
- PASS `SVC_NO_GL_FLAG`: mode=SOFT status=QUARANTINED
- PASS `PARENT_ACTIVE_SELLABLE`: parent status=ACTIVE remaining=88 (expected 88)
  - measured: `{"before":{"remaining":"100.0000","status":"ACTIVE"},"after":{"remaining":"88.0000","status":"ACTIVE","batch_number":"SQPD-20260825235227-P"}}`
- PASS `CHILD_QUARANTINED`: child status=QUARANTINED remaining=12 lot=SQPD-20260825235227-P-S1
  - measured: `{"child":{"remaining":"12.0000","status":"QUARANTINED","batch_number":"SQPD-20260825235227-P-S1","parent_lot_id":"2510ca8a-58b8-4593-865c-416367658b80","source_type":"SPLIT"}}`
- PASS `CONSERVATION`: parent+child remaining 88+12=100 (was 100)
- PASS `GENEALOGY`: parent_lot_id=2510ca8a-58b8-4593-865c-416367658b80 source_type=SPLIT
- PASS `MOV_SPLIT_NO_GL`: LOT_SPLIT movements=2 all posts_gl=false types=ADJUSTMENT_OUT,ADJUSTMENT_IN
  - measured: `{"splitMoves":[{"movement_type":"ADJUSTMENT_OUT","reference_type":"LOT_SPLIT","economic_event":"OTHER","posts_gl":false,"quantity":"12.0000","batch_id":"2510ca8a-58b8-4593-865c-416367658b80"},{"movement_type":"ADJUSTMENT_IN","reference_type`
- PASS `MOV_QUARANTINE_NO_GL`: quarantine QUARANTINE_TRANSFER+posts_gl=false count=1
  - measured: `{"qMoves":[{"movement_type":"DAMAGE","reference_type":"SOFT_Q_LIVE_PROOF","economic_event":"QUARANTINE_TRANSFER","posts_gl":false,"quantity":"12.0000","batch_id":"09ccbb99-7bf8-464f-9109-1154ed4ba760"}]}`
- PASS `NO_GL_AFTER_QUARANTINE`: ledger rows linked to proof movements before dispose=0
- PASS `FEFO_PARENT_ONLY`: ACTIVE selectable lots among pair=2510ca8a-58b8-4593-865c-416367658b80
  - measured: `{"selectable":[{"id":"2510ca8a-58b8-4593-865c-416367658b80","status":"ACTIVE"}]}`
- PASS `DISPOSE_5120`: dispose doc=LDISP-2026-00013 expense=5120 qty=12
  - measured: `{"dispose":{"documentId":"0faea6cc-3a02-48f5-994a-3d6e9fa996c0","documentNumber":"LDISP-2026-00013","expenseAccountCode":"5120","movementId":"0ae34c82-3cb2-4c81-8f82-71266e04b1f4","movementNumber":"MOV-2026-0261","batchId":"09ccbb99-7bf8-46`
- PASS `CHILD_CONSUMED`: child remaining after dispose=0.0000
  - measured: `{"childDisposed":{"remaining":"0.0000","status":"DEPLETED"}}`
- PASS `PARENT_UNTOUCHED_BY_DISPOSE`: parent still ACTIVE remaining=88.0000
- PASS `GL_DISPOSE_SHAPE`: DR5120=12000 expected=12000; lines=2; refs=STOCK_MOVEMENT
  - measured: `{"glDispose":[{"txn":"TXN-000074","account":"1300","debit":"0.000000","credit":"12000.000000","ref_type":"STOCK_MOVEMENT"},{"txn":"TXN-000074","account":"5120","debit":"12000.000000","credit":"0.000000","ref_type":"STOCK_MOVEMENT"}]}`
- PASS `FULL_NO_SPLIT`: full path child=parent id=caf53ed7-f1da-44c7-82a1-a73b611fd1a6 splitFrom=null
- PASS `FULL_STATUS_QTY`: full batch status=QUARANTINED remaining=5.0000 (unchanged qty)
- PASS `EXPIRED_SOFT`: EXPIRED soft qty=20
- PASS `EXPIRED_DISPOSE_5130`: expired dispose doc=LDISP-2026-00014 expense=5130
  - measured: `{"disposeExpired":{"documentId":"d89b380b-e3bd-41ef-ac77-ffb70d6c99f5","documentNumber":"LDISP-2026-00014","expenseAccountCode":"5130","movementId":"5b8d7570-7b8e-4de6-ae8a-90c51d160b56","movementNumber":"MOV-2026-0264","batchId":"b9af9d53-`
- PASS `EXPIRED_STALE_LOT_IGNORED`: dispose consumed batch=b9af9d53-d695-4a3c-bd9f-afbbdeda7e2d (stale productLotId was 2248161b-065d-4e07-82e7-e43d60061dc0)
- PASS `EXPIRED_CONSUMED`: expired batch remaining=0.0000
- PASS `CLEANUP`: left fixtures for audit sku=SQPD-20260825235227 productId=3f1e3960-f50c-402e-8d76-642bb9ca4569

## Reproduce

```bash
cd SamplePOS.Server && npx tsx scripts/proof-soft-quarantine-partial-damage-live.ts
npm run proof:soft-quarantine-partial-damage:live
```

Requires: `DATABASE_URL`, single-store mode, accounts 1300/5120, migration 609.
