# Proof: Sale data integrity (SALE-2026-4063)

Prevents:

- Customer shown on POS but `customer_id` null on sale (temp customer stripped)
- Header total ≠ line totals (e.g. 4.8M vs 5.1M)
- AT_COST customer charged with retail margin
- `unit_price` not matching `total_price ÷ qty`

## Run before deploy

```bash
# Unit guards (fast)
cd SamplePOS.Server && npm run proof:sale-integrity

# Client temp-customer resolver
cd samplepos.client && npm run test -- src/utils/resolvePosCustomerId.test.ts

# Full API proof (server on :3001)
npm run proof:sale-integrity:local
```

## PASS criteria (`proof:sale-integrity:local`)

| # | Check |
|---|--------|
| 1 | AT_COST customer created/loaded |
| 2 | Bulk pricing returns `at_cost` scope |
| 3 | Sale posts with `customer_id` set |
| 4 | `total_amount` = sum of lines |
| 5 | `unit_price × qty ≈ total_price` |
| 6 | Margin ≤ ~2.5% for AT_COST |
| 7 | `ERR_SALE_TOTAL_MISMATCH` when header drifts |
| 8 | Walk-in line economics consistent when totals match |

## Optional env

```bash
CUSTOMER_ID=81c0d6d5-d939-4bad-a17b-86728b4b72e4  # Henber BOU
PRODUCT_ID=<uuid>
BASE_URL=http://localhost:3001
```

## Related

- `INVESTIGATION_SALE_2026_4063.md` — production forensic for Ozempic/BOU sale
- `scripts/investigate-sale-4063-full.sql` — DB replay on Henber
