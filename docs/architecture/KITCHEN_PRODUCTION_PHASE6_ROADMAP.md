# Kitchen Production — Phase 6 Roadmap

**ADR:** [KITCHEN_PRODUCTION_ADR.md](./KITCHEN_PRODUCTION_ADR.md)  
**Depends on:** Phase 1–5 (batches, prepared food, buffet, waste, analytics)

## Goal

Ship a **centralised Kitchen Ops Hub** so operators do one action per business event — not multi-page draft → open → post rounds.

## Model

```
/kitchen (Hub board)
  next-action recommendation
  one-shot PRODUCE   → plan recipe + create + post inventory
  one-shot START     → create buffet session + open
  one-shot WASTE     → create + post LOSS_DISPOSAL
  one-shot END       → leftovers (optional) + close session
  live KPI strip + prepared QOH + open session capacity
```

Document-level advanced screens (`/kitchen/production`, buffet, waste drafts, analytics) remain for power users.

## Deliverables

| # | Item | Status |
|---|------|--------|
| 1 | Pure next-action helpers (`opsPlan`) | Done |
| 2 | `kitchenOpsService` + `/ops/*` APIs | Done |
| 3 | UI `/kitchen` hub (nav primary) | Done |
| 4 | Architecture + pure proofs | Done |

## API

```
GET  /api/kitchen-production/ops/board?serviceDate=
POST /api/kitchen-production/ops/quick-produce
POST /api/kitchen-production/ops/start-service
POST /api/kitchen-production/ops/quick-waste
POST /api/kitchen-production/ops/end-service
```

Permissions: read for board; **post** for one-shots (mutators re-use Inventory Engine services).

## Non-goals

Replacing draft document screens entirely; manufacturing MRP; multi-level BOM trees.
