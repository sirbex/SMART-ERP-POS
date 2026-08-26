# PROOF — Quarantine lifecycle E2E (damage / expiry / return)

**Verdict:** PASS
**Proven at:** 2026-08-26T18:02:56.305Z

**Contract:** DAMAGE/EXPIRY/RETURN lifecycle code contracts: two-step quarantine→dispose; mode adapters; no manual GL bypass; supplier vs customer return separation

- PASS `MS_DAMAGE`: multistore DAMAGE OUT → DAMAGE store quarantine
- PASS `SS_DAMAGE`: single-store DAMAGE OUT → soft quarantine (partial via quantity)
- PASS `SS_PARTIAL_SPLIT`: partial soft quarantine: splitLot then quarantine child only
- PASS `MANUAL_BLOCK`: manual stock movement API blocks immediate DAMAGE GL
- PASS `XFER_SHORTAGE`: transfer receive shortage → DAMAGE store + audit
- PASS `DISPOSE_5120`: dispose DAMAGE → 5120
- PASS `SOFT_TAG`: soft quarantine audit tags
- PASS `MS_EXPIRY`: multistore EXPIRY OUT → EXPIRED store quarantine
- PASS `SS_EXPIRY`: single-store EXPIRY OUT → soft EXPIRED status
- PASS `P2_AUTO`: P2 automation soft/hard without multistore-only gate
- PASS `P3_BRIDGE`: P3 expiring report bridge (expired only)
- PASS `P4_EXPIRED_ONLY`: P4 auto-dispose EXPIRED bucket only
- PASS `REPORT_SSOT`: expiring report warning + expired quarantine action
- PASS `ADJ_UI`: adjustments UI: partial quarantine + lot split messaging
- PASS `HARD_RETURN_AGING`: hard aging includes RETURN store
- PASS `SOFT_RETURN_EMPTY`: soft mode: no RETURN bucket (customer returns stay sellable)
- PASS `RETURN_DISPOSE_5110`: RETURN dispose → 5110 shrinkage
- PASS `CUSTOMER_RETURN_MS`: multistore customer refund → RETURN store path exists
- PASS `SUPPLIER_NOT_QUARANTINE`: supplier RETURN_GRN is AP/stock-out — not customer RETURN quarantine
- PASS `UI_RETURN_FILTER`: workqueue RETURN filter + soft-mode reset
- PASS `SUPPLIER_PAGE`: supplier returns page exists (separate workflow)

```bash
npm run proof:soft-quarantine-program
```
