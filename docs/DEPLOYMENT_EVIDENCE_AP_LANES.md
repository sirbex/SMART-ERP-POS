# AP Reconciliation Lanes — Deployment Evidence (Henber)

Template for release sign-off. Repair scripts are **not** executed by application deploy.

## Product deploy

| Item | Value |
|------|-------|
| Commit | _(fill after Commit 1)_ |
| Artifact | _(CI build / tag)_ |
| DB migrations | None required for lanes (read-only SQL in services) |

## API smoke tests

| Endpoint | Expected |
|----------|----------|
| `GET /api/erp-accounting/reconciliation/ap/integrity` | `gatesPeriodClose: true`, `integrityDifference` ≈ 0 |
| `GET /api/erp-accounting/reconciliation/ap/cache` | `gatesPeriodClose: false` |
| `GET /api/erp-accounting/reconciliation/ap/history` | `status: INFORMATIONAL` |

## Integrity proof (post-remediation)

```
integrityGlDrift:     0
glSupplierScope:      27,491,731
openItemSubledger:    27,491,731
```

`proof-ap-drift-decompose.mjs` — Layer 6 decomposition = 0.

## SCN application GL pattern (TXN-018907 review)

Both APPLIED SCNs reference a paid bill and share pattern class **SCN_DEBIT_2100_PLUS_INVOICE_OFFSET** after remediation:

| SCN | Ref bill | SCN post (2100 Dr) | Offset (2100 Cr) | Net-active 2100 |
|-----|----------|--------------------|------------------|-----------------|
| SCN-2026-0007 | SBILL-2026-0252 | TXN-010561 | TXN-011801 | 0 |
| SCN-2026-0008 | SBILL-2026-0382 | TXN-013737 | TXN-018907 | 0 |

**Business event:** Supplier credit note applied to reference invoice. SCN posts Dr 2100 / Cr clearing (**2150** for SCN-0007, **2160** for SCN-0008 — GR/RGRN path determines clearing account). Offset `SUPPLIER_INVOICE` entry nets applied credit on AP: Dr 6900 / Cr 2100. Both use `PostingSource: PURCHASE_BILL`.

**Not metadata-only:** SCN-0008 required missing offset journal; `is_posted_to_gl` sync alone would not change open-item (APPLIED, OB=0).

## Period close

Only Lane 1 (`integrityGlDrift` / `isApSupplierGlIntegrityMatched`) gates period close. UI banner uses integrity lane for AP.

## Maintenance (separate from product deploy)

| Lane | Remaining (Henber) | Action |
|------|-------------------|--------|
| Cache | ~500 UGX | `recalc-supplier-balances` |
| STORED_BALANCE | ~7.3M | rebase 2100 cache |

## Repair scripts (Commit 2 — manual only)

- `henber-kamcare-integrity-repair.mjs` — executed 2026-06-27, TXN-018907
- `henber-kamcare-metadata-finish.mjs` — executed 2026-06-27

Confirmed: not wired to CI, deploy hooks, or `healApCachesIfDrifted`.

## Post-deploy verification checklist

- [ ] AP Integrity card green
- [ ] AR reconciliation summary
- [ ] Inventory reconciliation
- [ ] Trial Balance
- [ ] Balance Sheet
- [ ] Supplier Statement / Aging
- [ ] Customer Aging
