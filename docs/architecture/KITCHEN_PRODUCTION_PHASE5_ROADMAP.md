# Kitchen Production — Phase 5 Roadmap

**ADR:** [KITCHEN_PRODUCTION_ADR.md](./KITCHEN_PRODUCTION_ADR.md)  
**Depends on:** Phase 1–4 (batches, prepared food, buffet sessions, waste)

## Goal

Ship **operational food-cost analytics** from kitchen documents:

- Theoretical vs actual ingredient cost on posted production batches  
- Waste cost by reason / product  
- Buffet cover revenue, sell-through, contribution after session waste  
- Kitchen food-cost % vs cover revenue (ops KPI — **not** GL P&L SSOT)

## Model

```
POSTED production batches  → actual ingredient $ + plan variance
POSTED waste docs          → waste $ (all reasons)
Buffet sessions + ledger   → sold covers + cover revenue (sale_items)
KPI foodCost%              → (production $ + waste $) / cover revenue
```

Read-only; no new inventory writers.

## Deliverables

| # | Item | Status |
|---|------|--------|
| 1 | Pure analytics helpers (variance, foodCost%) | Done |
| 2 | Analytics service + API routes | Done |
| 3 | UI `/kitchen/analytics` | Done |
| 4 | Architecture + pure proofs | Done |

## API

```
GET /api/kitchen-production/analytics/summary?from=&to=
GET /api/kitchen-production/analytics/production-variance?from=&to=
GET /api/kitchen-production/analytics/waste?from=&to=
GET /api/kitchen-production/analytics/buffet?from=&to=
```

Requires `kitchen.production.read` and `kitchen_production_enabled`.

## Non-goals

MRP, multi-level BOM cost roll-up trees, recipe optimizer, replacing financial P&L.
