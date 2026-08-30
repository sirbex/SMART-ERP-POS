# PROOF — GR full reverse (live)

**Generated:** 2026-08-30T07:32:04.885Z  
**Verdict:** **PASS** (16/16)  
**Scope:** Full reverse auto-cancels linked bills + reverses AP GL + posts Return GRN + marks GR reversed + PO→DRAFT; rebill blocked

## Fixtures

- GR: `GR-GFR-20260830073203`
- PO: `PO-GFR-20260830073203`
- Bill: `SBILL-2026-0026`
- RGRN: `RGRN-2026-0010`

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `SSOT_PLAN_CANCEL` | PASS | toCancel=1 blockers=0 |
| `SSOT_PLAN_BLOCK_PAID` | PASS | toCancel=0 blockers=Bill SBILL-PAID has payments applied — cannot reverse this goods receipt. Unallocate or refund payments first, or use Return to Supplier + credit note. |
| `USER` | PASS | userId=2201cbde-f130-460a-97f2-d163080c5798 |
| `SUPPLIER` | PASS | supplier=VERIFY-OB-TEST-SUP |
| `SEED_PRODUCT` | PASS | sku=GFR-20260830073203 uom=ea6d95c7 |
| `SEED_GR_STOCK` | PASS | GR-GFR-20260830073203 qty=4 batch=6098d950 |
| `BILL_POSTED` | PASS | invoice=SBILL-2026-0026 total=6000.000000 posted=true openGl=1 |
| `ELIGIBILITY_ALLOWS` | PASS | allowed=true route=REVERSE_UNINVOICED_RECEIPT billsToAutoCancel=1 blockers=[] |
| `REVERSE_OK` | PASS | rgrn=RGRN-2026-0010 cancelled=[{"invoiceId":"34ecd26c-7cbd-4665-868d-b3df63c4c5b9","invoiceNumber":"SBILL-2026-0026","glReversed":true}] |
| `BILL_CANCELLED` | PASS | status=Cancelled outstanding=0.000000 |
| `BILL_GL_REVERSED` | PASS | openGlAfter=0 (must be 0) |
| `GR_REVERSED` | PASS | reversed=true rgrn=6670f269-164f-4143-9cef-8959d493a328 |
| `RGRN_POSTED` | PASS | status=POSTED reason=[Full reverse] LIVE proof full reverse 20260830073203 |
| `PO_DRAFT` | PASS | po.status=DRAFT (must be DRAFT after full reverse) |
| `REBILL_BLOCKED` | PASS | Cannot bill GR GR-GFR-20260830073203 — receipt was fully reversed (uninvoiced) by RGRN-2026-0010. No AP liability remains. |
| `STOCK_RETURNED` | PASS | batch.remaining=0.0000 (must be 0) |

## Run

```bash
npm run proof:gr-full-reverse:live
```
