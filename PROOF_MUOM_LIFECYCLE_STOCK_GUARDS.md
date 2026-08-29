# PROOF — MUoM lifecycle stock guards

**Generated:** 2026-08-29T09:05:11.363Z  
**Verdict:** **PASS** (21/21 gates)  
**Scope:** Proven only: schema columns for on-hand, SSOT wiring, rebase block, factor block with on-hand, pack rename + price override with stock

## Out of scope (not claimed)

- Multi-UOM enable wizard UI
- SKU migrate/split workflow
- Live tenant DB mutation proof
- Industry product marketing claims

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `SCHEMA_PRODUCT_INVENTORY` | PASS | product_inventory.quantity_on_hand exists in migration 410 |
| `SCHEMA_INVENTORY_BATCHES` | PASS | inventory_batches.remaining_quantity + product_id exist in 001 |
| `SCHEMA_SNAPSHOT_COLS` | PASS | transaction snapshot invariant documented in 415 |
| `WIRE_SSOT_FILE` | PASS | SSOT file present |
| `WIRE_SVC_IMPORTS_SSOT` | PASS | uomService imports lifecycle SSOT |
| `WIRE_SVC_CALLS_ONHAND` | PASS | updateProductUom measures on-hand before factor change |
| `WIRE_SVC_NO_SILENT_REBASE` | PASS | pendingBaseUomId rebase path absent; rebaseBlockedReason present |
| `WIRE_REPO_ONHAND_SQL` | PASS | on-hand SQL uses inventory cache + batch remaining |
| `WIRE_SSOT_MESSAGES` | PASS | SSOT message constants stable |
| `WIRE_NPM_SCRIPT` | PASS | npm proof scripts registered |
| `STOCK_DETECT` | PASS | on-hand detect |
| `FACTOR_GATE` | PASS | factor only when stock ~0 |
| `FACTOR_MSG` | PASS | factor block message SSOT |
| `FACTOR_MEANINGFUL` | PASS | meaningful factor delta |
| `REBASE_DETECT` | PASS | base row identity change is rebase; pack rename is not |
| `REBASE_MSG` | PASS | rebase message SSOT |
| `BEH_FACTOR_BLOCK` | PASS | no DB write on factor block |
| `BEH_FACTOR_OK_ZERO` | PASS | factor edit at zero stock |
| `BEH_REBASE_BLOCK` | PASS | no silent rebase via rename |
| `BEH_PACK_RENAME_OK` | PASS | non-base rename with stock + unchanged factor |
| `BEH_PRICE_OK` | PASS | price override with stock |
