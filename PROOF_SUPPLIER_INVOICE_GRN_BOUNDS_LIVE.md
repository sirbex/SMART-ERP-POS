# PROOF — Supplier invoice GRN bounds (LIVE)

**Verdict:** PASS
**Proven at:** 2026-08-26T18:02:51.811Z

**Contract:** LIVE: over-GRN bill rejected without reason and with wrong reason; accepted only with PRICE_VARIANCE; manual grnIds inflate rejected; fake GR rejected; exact match accepted

## Gates

- PASS `USER`: userId=2201cbde-f130-460a-97f2-d163080c5798
- PASS `SUPPLIER`: supplier=VERIFY-OB-TEST-SUP
- PASS `SEED_PRODUCT`: productId=0507a3e8-bdc1-414e-85fc-638e6c8dfad0 sku=SIGB-20260826180250
- PASS `SEED_GR`: grn=GR-SIGB-P-20260826180250 billable=10000
- PASS `ASSERT_READY`: assertLinked billable=10000 expected=10000
- PASS `FAKE_GRN_REJECT`: Cannot bill: goods receipt not found (9dab5261-61eb-4242-b534-17970975396c)
- PASS `REJECT_OVER_NO_REASON`: Supplier bill total differs from goods received value for GR-SIGB-P-20260826180250 by UGX 2500.00. Select a variance reason (PRICE_VARIANCE if the supplier bill
- PASS `REJECT_OVER_DISCOUNT`: Supplier bill (12500.00) exceeds goods received value (10000.00) for GR-SIGB-P-20260826180250. Use PRICE_VARIANCE only when the supplier legitimately billed mor
- PASS `ACCEPT_OVER_PV`: invoice=SBILL-2026-0008 AP=12500 grnStored=10000 reason=PRICE_VARIANCE posted=true
- PASS `REJECT_MANUAL_OVER`: Supplier bill total differs from goods received value for GR-SIGB-M-20260826180250 by UGX 2500.00. Select a variance reason (PRICE_VARIANCE if the supplier bill
- PASS `ACCEPT_EXACT`: exact bill AP=10000.000000 expected=10000
- PASS `CLEANUP`: left fixtures sku=SIGB-20260826180250

## Reproduce

```bash
cd SamplePOS.Server && npx tsx scripts/proof-supplier-invoice-grn-bounds-live.ts
npm run proof:supplier-invoice-grn-bounds:live
```
