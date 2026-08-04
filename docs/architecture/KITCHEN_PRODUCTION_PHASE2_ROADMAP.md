# Kitchen Production — Phase 2 Roadmap

**ADR:** [KITCHEN_PRODUCTION_ADR.md](./KITCHEN_PRODUCTION_ADR.md)  
**Depends on:** Phase 1 Production Batch (`587`)

## Goal

Mark **prepared / finished food** in the product catalog and separate **Kit (at-sale)** recipes from **Manufacture (at-production)** recipes so cook-to-stock SKUs do not double-consume ingredients when sold.

## Odoo / SAP mapping

| Pattern | SMART |
|---------|--------|
| Kit BoM | `usage_mode = AT_SALE` (default) — ingredients at payment |
| Manufacture BoM | `usage_mode = AT_PRODUCTION` — produce FG, sell parent stock |
| Semi-finished / FG material | `is_prepared_food = true` on inventory products |

## Deliverables

| # | Deliverable |
|---|-------------|
| 1 | Migration 588: `usage_mode`, `is_prepared_food` |
| 2 | `planSaleStockDeduction` / `explodeActiveRecipe` respect production-only recipes |
| 3 | Product form + recipes UX |
| 4 | Kitchen Production filters prepared foods |
| 5 | Architecture + sale matrix proof tests |

## Non-goals

Buffet sessions (Phase 3), yield docs (Phase 4), food-cost analytics (Phase 5).
