# Kitchen Production — Phase 4 Roadmap

**ADR:** [KITCHEN_PRODUCTION_ADR.md](./KITCHEN_PRODUCTION_ADR.md)  
**Depends on:** Phase 1–3 (batches, prepared food, buffet sessions)  
**Related:** [LOSS_QUARANTINE_ADR.md](./LOSS_QUARANTINE_ADR.md) — expense accounts 5110/5120/5130

## Goal

Ship **Waste / Yield** documents so kitchen leftovers, cooking loss, spoilage, and staff meals post into the **Inventory Engine** (not a parallel ledger):

- FEFO `consumeLot` at kitchen store  
- `stock_movements` with ADR-004 types (`ADJUSTMENT_OUT` / `DAMAGE`)  
- GL **DR 5110|5120 / CR 1300** (LOSS_DISPOSAL economic event)  
- Optional link to **buffet session** or **production batch**  
- Session **close + leftovers** in one flow  

## Model

```
Production Batch POST     → FG stock
Buffet OPEN + cover sales → capacity only
Waste / CLOSING POST      → remove leftover FG (or ingredients) + P&L loss
Session CLOSE             → freeze covers; leftover waste optional
```

Buffet still **is not a recipe**. Leftovers are explicit write-offs of prepared products already on hand.

## Deliverables

| # | Item | Status |
|---|------|--------|
| 1 | Migration 590: `kitchen_waste_documents` / lines | Done |
| 2 | Pure reason → ADR-004 account / movement map | Done |
| 3 | Service draft / post / cancel + close-with-leftovers | Done |
| 4 | API + UI `/kitchen/waste` | Done |
| 5 | Architecture + pure proofs | Done |

## Apply

```
shared/sql/587_kitchen_production_phase1.sql
shared/sql/588_kitchen_prepared_food_catalog.sql
shared/sql/589_kitchen_buffet_sessions.sql
shared/sql/590_kitchen_waste_yield.sql
```

Enable `kitchen_production_enabled`. Same RBAC as production (`kitchen.production.*`).

## Non-goals (later)

Further optional work (WIP account, multi-level BOM) is outside kitchen food-cost analytics (**Phase 5** shipped).
