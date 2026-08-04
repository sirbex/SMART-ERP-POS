# Kitchen Production — Phase 3 Roadmap

**ADR:** [KITCHEN_PRODUCTION_ADR.md](./KITCHEN_PRODUCTION_ADR.md)  
**Depends on:** Phase 1–2 (production batch + prepared food / recipe usage)

## Goal

Ship **Buffet Session** documents for hotel breakfast, lunch buffet, conference catering:

- Session is a **capacity** document (covers + prepared dish targets)
- **Not** a flat buffet recipe of mixed ingredients
- Customer sale of cover product **does not** explode ingredients (already done in production)
- Sale records **sold covers** against the OPEN session

## Model

```
Kitchen Production (Phase 1)  →  prepared FG stock
Buffet Session OPEN           →  expected covers + prepared targets (ops plan)
Sale cover product × N        →  sold_covers += N  (capacity)
Session CLOSE                 →  freeze; leftover handling → Phase 4 waste
```

## Deliverables

| # | Item | Status |
|---|------|--------|
| 1 | Migration 589: sessions, lines, cover ledger, `is_buffet_cover` | Done |
| 2 | Service: draft / open / close / cancel / consume covers | Done |
| 3 | createSale hook for buffet covers | Done |
| 4 | API + UI workspace `/kitchen/buffet-sessions` | Done |
| 5 | Architecture + pure coversAllowed proofs | Done |

## Apply

```
shared/sql/587_kitchen_production_phase1.sql
shared/sql/588_kitchen_prepared_food_catalog.sql
shared/sql/589_kitchen_buffet_sessions.sql
```

Enable `kitchen_production_enabled`. Cover product: service (or any) with Buffet cover flag; open session before selling covers.

## Non-goals (later)

Per-plate FG auto-issue. Yield/waste documents shipped in **Phase 4**. Profitability reports remain Phase 5.
