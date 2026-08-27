# PROOF — Supplier bill cancel (live)

**Verdict:** PASS (9/9)

| Gate | Result | Detail |
|------|--------|--------|
| USER | PASS | userId=2201cbde-f130-460a-97f2-d163080c5798 |
| SUPPLIER | PASS | supplier=VERIFY-OB-TEST-SUP |
| SEED_PRODUCT | PASS | sku=SBC-20260827055708 |
| SEED_GR | PASS | GR-SBC-20260827055708 total=10000 |
| BILL_POSTED | PASS | invoice=SBILL-2026-0013 total=10000.000000 openGl=1 |
| REJECT_PAID | PASS | Reverse supplier payments on this bill before cancelling. |
| CANCEL_OK | PASS | glReversed=true status=Cancelled openGl=0 |
| REBILL_GR | PASS | rebill=SBILL-2026-0014 |
| REJECT_ALREADY_CANCELLED | PASS | This bill is already cancelled. |
