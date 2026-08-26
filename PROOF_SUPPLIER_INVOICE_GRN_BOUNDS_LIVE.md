# PROOF — Supplier invoice GRN bounds (LIVE)

**Verdict:** PASS
**Proven at:** 2026-08-26T17:52:16.461Z

**Contract:** LIVE: over-GRN bill rejected without reason and with wrong reason; accepted only with PRICE_VARIANCE; manual grnIds inflate rejected; fake GR rejected; exact match accepted

## Gates

- PASS `USER`: userId=2201cbde-f130-460a-97f2-d163080c5798
- PASS `SUPPLIER`: supplier=VERIFY-OB-TEST-SUP
- PASS `SEED_PRODUCT`: productId=3c74eee1-3756-4eca-8ffc-207a98e9f233 sku=SIGB-20260826175215
- PASS `SEED_GR`: grn=GR-SIGB-P-20260826175215 billable=10000
- PASS `ASSERT_READY`: assertLinked billable=10000 expected=10000
- PASS `FAKE_GRN_REJECT`: Cannot bill: goods receipt not found (4b3e3ba8-0e6b-44ed-8edc-26a1b032ad7f)
- PASS `REJECT_OVER_NO_REASON`: Supplier bill total differs from goods received value for GR-SIGB-P-20260826175215 by UGX 2500.00. Select a variance reason (PRICE_VARIANCE if the supplier bill
- PASS `REJECT_OVER_DISCOUNT`: Supplier bill (12500.00) exceeds goods received value (10000.00) for GR-SIGB-P-20260826175215. Use PRICE_VARIANCE only when the supplier legitimately billed mor
- PASS `ACCEPT_OVER_PV`: invoice=SBILL-2026-0006 AP=12500 grnStored=10000 reason=PRICE_VARIANCE posted=true
- PASS `REJECT_MANUAL_OVER`: Supplier bill total differs from goods received value for GR-SIGB-M-20260826175215 by UGX 2500.00. Select a variance reason (PRICE_VARIANCE if the supplier bill
- PASS `ACCEPT_EXACT`: exact bill AP=10000.000000 expected=10000
- PASS `CLEANUP`: left fixtures sku=SIGB-20260826175215

## Reproduce

```bash
cd SamplePOS.Server && npx tsx scripts/proof-supplier-invoice-grn-bounds-live.ts
npm run proof:supplier-invoice-grn-bounds:live
```
