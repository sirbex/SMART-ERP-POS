# Warehouse Network — Phase 14 Testing Contract

Regression and certification gates for the **Multi-Store Warehouse Network** (phases 1–13). Run before merging or deploying multistore inventory changes.

## Regression commands

```bash
# Phase-by-phase certification (recommended — per-phase proof table)
npm run proof:warehouse-network-phases

# Single phase only, e.g. GRN + transfers
PHASES=7,8 npm run proof:warehouse-network-phases

# Fast — unit tests only (~5s)
cd SamplePOS.Server && npm run test:warehouse-network

# Full E2E matrix — API on :3001 + tenant DB (~2–4 min)
npm run proof:warehouse-network-matrix

# Phase-by-phase + matrix
npm run proof:warehouse-network:all

# Financial parity (GRN + sale OFF vs ON)
npm run proof:multistore:financial-parity

# DB certification audit (optional, separate audit DB)
npm run proof:multistore:audit

# Mandatory deploy gate (unit + matrix)
npm run deploy:gate:warehouse-network
```

**Prerequisites for live proofs:**

1. Tenant migrations applied (`525`–`531` at minimum): `cd SamplePOS.Server && npm run migrate`
2. API running: `npm run dev:server` (port 3001)
3. `DATABASE_URL` in `SamplePOS.Server/.env` pointing at the same DB the API uses

## Phase-by-phase proof map

| Phase | What is proven | Consistency / no-duplication |
|------:|----------------|---------------------------|
| 1 | Audit docs exist | Baseline documented before implementation |
| 2 | Schema migrations 525–531 | Unique store codes; separate `inventory_aggregate_balances` vs composite |
| 3 | Shared types in `shared/types` | Single DTO source |
| 4 | Warehouse repositories | One RAW SQL layer per concern |
| 5 | `isMultistoreEnabled` SSOT | OFF → legacy paths; multistore APIs blocked when OFF |
| 6 | Stock visibility | Store-scoped dimensions |
| 7 | GRN | **OFF: batches only, zero composite**; ON: MAIN composite |
| 8 | Transfers + assortment | TRANSIT cleared after RECEIVED |
| 9 | POS catalog | Stock at selling store after transfer |
| 10 | Sales | `sale_items` store + lot trace |
| 11 | Returns | RETURN store restore |
| 12 | Expiry automation | Preview endpoint |
| 13 | Reporting | Network summary API |
| 14 | Unit + matrix tests | Regression gate |
| X | Cross-phase | All services use `isMultistoreEnabled`; composite qty ≤ batch qty |

Output: `PROOF_WAREHOUSE_NETWORK_PHASES.md` (phases) or `PROOF_WAREHOUSE_NETWORK_MATRIX.md` (matrix).

## Proof matrix gates

| Gate | What it proves |
|------|----------------|
| 0 | Unit tests (`transferWorkflowService`) |
| 1 | API health + login |
| 2 | Schema: `store_locations`, `product_lots`, `inventory_balances`, `store_transfers`, trace columns (`531`, `530`) |
| 3 | **Legacy OFF** — stock-levels works; network reports rejected |
| 4 | **Bootstrap** — multistore ON, default store network seeded |
| 5 | **GRN** — composite lot + MAIN balance after finalize |
| 6 | **Transfer** — DIRECT MAIN → SELLING with assortment expansion |
| 7 | **POS sale** — `sale_items.store_location_id` + `product_lot_id` populated |
| 8 | **Refund** — stock restored to RETURN store |
| 9 | **Stock count** — store-scoped count with `product_lot_id` on lines |
| 10 | **Expiry automation** — preview endpoint |
| 11 | **Reporting** — `GET /inventory/reports/network` |
| 12 | **Financial parity** — identical GL/stock deltas OFF vs ON (`proof-multistore-financial-parity`) |

## Protected areas

Changes to these modules should pass the deploy gate:

- `SamplePOS.Server/src/modules/inventory/warehouse/**`
- `shared/sql/525_*.sql` … `531_*.sql`
- `shared/types/warehouseNetwork.ts`, `storeTransfer.ts`, `warehouseReports.ts`
- Multistore branches in `goodsReceiptService`, `salesService`, `stockCountService`

## Cross-flow multistore coverage (post Phase 14)

When `is_multistore_enabled` is ON, these flows use composite `inventory_balances` + batch subledger (not legacy-only FEFO):

| Flow | Service | Store |
|------|---------|-------|
| Quotation → sale | `quotationService` | SELLING |
| Sale void | `warehouseSaleVoidRestoreService` | Original store/lot from `sale_items` |
| DN PGI (post) | `deliveryNoteService` | MAIN |
| Distribution delivery | `distRepository.deductStockFEFO` | MAIN |
| DAMAGE adjustment OUT | `warehouseAdjustmentService` | → DAMAGE quarantine store |

Unit test: `warehouseSaleVoidRestoreService.test.ts`
