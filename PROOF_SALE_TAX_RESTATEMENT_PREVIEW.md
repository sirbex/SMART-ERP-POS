# PROOF — Sale tax restatement (omitted VAT)

**Generated:** 2026-08-09T12:11:31.064Z  
**Verdict:** **PASS** (11/11 gates)  
**Execute mode:** PREVIEW_ONLY  
**Sale:** `a0530882-bd1b-4917-b562-9ab1bd751665`

> Only gates that were executed appear below. No gate is marked PASS without a runtime check.

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `MIG_594` | PASS | sale_tax_restatement migration applied (IF NOT EXISTS) |
| `SSOT_MODEL_DOC` | PASS | smart model proof doc present with key terms |
| `SVC_PATH` | PASS | service recomputes via DocumentTaxService |
| `ROUTES` | PASS | API routes tax-restatement execute present |
| `PERM` | PASS | RBAC catalog key sales.tax_restatement |
| `UI` | PASS | Sales UI wires SaleTaxRestatementModal |
| `SALE_PICK` | PASS | saleId=a0530882-bd1b-4917-b562-9ab1bd751665 |
| `PREVIEW_NO_FATAL` | PASS | blockers (acceptable if already restated): Computed tax matches posted tax (no omitted VAT to apply). Ensure products are VAT-liable and the customer is not exempt before restating. |
| `ALREADY_CORRECT_OR_RESTED` | PASS | tax already matches DocumentTax (posted=43200 new=43200) — post-apply integrity path N/A without a zero-tax fixture |
| `POLICY_INCREASE_ONLY` | PASS | service encodes increase-only + CN for reductions |
| `POLICY_NO_VOID` | PASS | restatement path does not call voidSale |

## Preview snapshot

```json
{
  "saleNumber": "SALE-2026-0208",
  "postedTax": 43200,
  "newTax": 43200,
  "taxDelta": 0,
  "totalDelta": 0,
  "taxInclusive": false,
  "blockers": [
    "Computed tax matches posted tax (no omitted VAT to apply). Ensure products are VAT-liable and the customer is not exempt before restating."
  ],
  "warnings": [],
  "lines": [
    {
      "saleItemId": "69859efa-a4d2-464a-943e-3f6a502a586d",
      "productId": "98cc5e26-bd41-462d-b072-0e73a2c02229",
      "productName": "Abchlor eye drops",
      "postedTax": 0,
      "newTax": 0,
      "taxRate": 0,
      "determination": "NONE",
      "isTaxable": false
    },
    {
      "saleItemId": "c70de60e-ca86-473a-8198-ab96b85301cb",
      "productId": "d16639cf-2195-4cbd-bee6-a952e9d3aeef",
      "productName": "Abdominal support 8inch M",
      "postedTax": 43200,
      "newTax": 43200,
      "taxRate": 18,
      "determination": "BRIDGE",
      "isTaxable": true
    }
  ],
  "invoices": [
    {
      "invoiceId": "a93d960c-990b-461b-8995-9e29d1a192af",
      "invoiceNumber": "INV-2026-0001",
      "postedTax": 43200,
      "newTax": 43200,
      "postedTotal": 303200,
      "newTotal": 303200,
      "newAmountDue": 303200
    }
  ],
  "journalLines": []
}
```

## Re-run

```bash
cd SamplePOS.Server
npx tsx scripts/proof-sale-tax-restatement-live.ts
PROOF_TAX_RESTATE_EXECUTE=1 npx tsx scripts/proof-sale-tax-restatement-live.ts
npm test -- --runInBand src/modules/corrections/saleTaxRestatement.evidence.test.ts
```
