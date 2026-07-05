# Warehouse Network — Frontend UI Pre-Flight Audit

**Date:** 2026-06-28  
**Scope:** Map spec paths to actual codebase before multistore UI work.

## Navigation hub

| Spec | Actual |
|------|--------|
| `/src/components/layout/Sidebar.tsx` | **Not present** — inventory nav lives in `samplepos.client/src/components/InventoryLayout.tsx` (tab bar) + `Layout.tsx` main sidebar |
| Route root `/src/pages/inventory/*` | **Confirmed** — `App.tsx` routes under `/inventory` |

## Table component

| Spec | Actual |
|------|--------|
| `DataTable.tsx` | **`samplepos.client/src/components/shared/DataTable.tsx`** — column-config grid with `visible` flag for conditional columns |
| Legacy inventory tables | `SortableTableHeader` + `ResponsiveTableWrapper` (Stock Levels sortable grid) |
| Selectors | `@/components/ui/select` via `StoreLocationSelect.tsx` |
| Dialogs | `@/components/ui/dialog` for transfer wizard, store create |
| Multistore fail-safe | `MultistoreGate.tsx` — returns `null` when flag off or loading |

## Page mapping (spec → codebase)

| Spec file | Actual file | Route |
|-----------|-------------|-------|
| `InventoryList.tsx` | `StockLevelsPage.tsx` | `/inventory` |
| `ProductDetail.tsx` | `ProductsPage.tsx` (history modal = product detail surface) | `/inventory/products` |
| `GoodsReceipt.tsx` | `GoodsReceiptsPage.tsx` | `/inventory/goods-receipts` | Destination Store column per line (default MAIN) |
| `StoreManagement.tsx` | **NEW** | `/inventory/stores` |
| `StoreTransfers.tsx` | **NEW** | `/inventory/store-transfers` |
| `TransferApprovals.tsx` | **NEW** | `/inventory/transfer-approvals` |

## Feature flag

- Backend: `system_settings.is_multistore_enabled` (default `false`)
- Client: `useMultistoreEnabled()` → `GET /api/system-settings`
- **Rule:** When flag is `false`, hide all multistore UI via `MultistoreGate` / `multistoreOnly` on selectors — never render blank store headers
- **N+1 mitigation:** Page-level `buildStoreLabelMap()` + pre-flattened row DTOs before `DataTable` render

## API surface (backend ready)

| Endpoint | Purpose |
|----------|---------|
| `GET /inventory/store-locations` | List/configure stores |
| `GET /inventory/products/:id/store-distribution` | Stock by store (multistore) |
| `GET /inventory/stock-levels?storeLocationId=` | Stock list scoped to store |
| `GET/POST /inventory/store-transfers` | Transfer workflow |
| GR item `targetStoreLocationId` | Destination store on GRN lines |
