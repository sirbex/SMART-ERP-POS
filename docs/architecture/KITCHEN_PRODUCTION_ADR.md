# ADR-005 — Kitchen Production Domain Foundation

**Status:** Accepted — Phases 1–6 complete (kitchen production domain + central ops hub)  
**Date:** 2026-08-04  
**Related:** [INVENTORY_LOT_DOMAIN_ADR.md](./INVENTORY_LOT_DOMAIN_ADR.md), [RESTAURANT_OFFLINE_ADR.md](./RESTAURANT_OFFLINE_ADR.md), [LOSS_QUARANTINE_ADR.md](./LOSS_QUARANTINE_ADR.md)  
**Roadmap:** Phase [1](./KITCHEN_PRODUCTION_PHASE1_ROADMAP.md), [2](./KITCHEN_PRODUCTION_PHASE2_ROADMAP.md), [3](./KITCHEN_PRODUCTION_PHASE3_ROADMAP.md), [4](./KITCHEN_PRODUCTION_PHASE4_ROADMAP.md), [5](./KITCHEN_PRODUCTION_PHASE5_ROADMAP.md), [6](./KITCHEN_PRODUCTION_PHASE6_ROADMAP.md)

---

## 0. Objective (freeze statement)

**Kitchen Production is a business document family that posts into the existing Inventory Engine.**

It does **not** own stock balances, lots, UoM, cost layers, or GL. It decides what happened operationally (prepared, held, issued, produced) and translates that into standard inventory movements and governed journals.

**Reject manufacturing module first.** A restaurant kitchen is not a plant MRP. Prefer kitchen-specific concepts (prep batches, buffet sessions, yield, leftovers) reusing FEFO / lots / transfers / waste already certified.

Cook-to-order (today’s Restaurant: order → KOT → pay → recipe explosion) remains first-class and **unchanged**. Kitchen Production is **additive and optional**.

---

## 1. Context

Investigation (2026-08) verified:

| Capability | Status |
|------------|--------|
| Restaurant FOH, KOT, KDS | Implemented |
| Recipe/BOM one-level, explosion at **payment only** | Implemented |
| Lots FEFO, multistore transfers, GL, waste | Implemented |
| Production batch / prepared FG / buffet session | Missing |
| Manufacturing MRP | Missing (and not the target model) |

Global patterns we adopt:

| System pattern | SMART mapping |
|----------------|---------------|
| **Odoo Kit BOM** | Cook-to-order: sale-time ingredient explode (existing) |
| **Odoo Manufacturing Order** | Cook-to-stock: Production Batch document |
| **SAP GI 261 + GR 101** | Issue components + receive FG with batch cost roll-up |
| **SAP “plan assemblies / SFG”** | Prepared food as normal inventory products |

---

## 2. Decision

### 2.1 Document family → Inventory Engine

```
Purchase / Transfer / Adjustment / Sale / Kitchen Production
        \___________ Inventory Engine (SSOT) ___________/
```

Inventory Engine owns: balances, lots/FEFO, UoM, cost layers, ledger, GL posting.  
Kitchen Production only authors documents and calls lot receive/consume + stock_movements + production journal.

### 2.2 Production modes (first-class)

| Mode | Inventory path | Phase |
|------|----------------|-------|
| **COOK_TO_ORDER** | Existing recipe-at-pay | Keep forever |
| **COOK_TO_STOCK** | Production Batch → FG inventory → sale of FG | **Phase 1** |
| **COOK_TO_SESSION** | Session + batches → capacity → cover sale | **Phase 3** |

### 2.3 Buffet is not a recipe

Buffet/session products are **service / cover capacity** (`products.is_buffet_cover`). Ingredients are consumed when preparing FG dishes (Phase 1 batches). **Phase 3** ships `kitchen_buffet_sessions` (+ lines, cover ledger): OPEN sessions bind cover sales on `createSale` via `tryConsumeCoversForSale` (sold covers only; no ingredient re-issue).

| Field / artifact | Meaning |
|------------------|---------|
| `products.is_buffet_cover` | Capacity menu SKU; requires OPEN session when sold |
| `kitchen_buffet_sessions` | DRAFT → OPEN → CLOSED (or CANCELLED) |
| `kitchen_buffet_session_lines` | Prepared dish **targets** (ops plan, not auto-issue) |
| `kitchen_buffet_cover_ledger` | Sale audit of covers recorded |

### 2.4 Finished food = normal products

Produced SKUs are catalog `inventory` / `consumable` products. Lot `sourceType = PRODUCTION` already exists on the lot domain (ADR-002).

**Phase 2 catalog:**

| Field | Meaning |
|-------|---------|
| `products.is_prepared_food` | Kitchen finished / semi-finished product (filter + UX) |
| `product_recipes.usage_mode` | `AT_SALE` (kit: explode at pay) or `AT_PRODUCTION` (manufacture: produce FG, sell parent) |

Default `usage_mode = AT_SALE` preserves cook-to-order. Cook-to-stock parents must use `AT_PRODUCTION` so sale does **not** re-explode ingredients.

### 2.5 Kitchen store = semantics first

No new `store_type` in Phase 1. Operators name a MAIN/SELLING (or other non-quarantine) location “Kitchen”. Production issues/receives on **that** `store_location_id`. MAIN → Kitchen remains store transfers.

### 2.6 Additive, not mandatory

Flag: `system_settings.kitchen_production_enabled` default **FALSE**.  
When off: zero API mutation side effects; cook-to-order restaurant unchanged.

### 2.7 Document types (family)

| Type | Phase | Purpose |
|------|-------|---------|
| `PRODUCTION_BATCH` | **1** | Consume ingredients + produce one FG qty |
| `INGREDIENT_ISSUE` | later | Optional standalone issue |
| `BUFFET_SESSION` | 3 | Service period capacity |
| `WASTE_YIELD` | **4** | Cooking loss, leftovers, staff meals |
| `CLOSING` | **4** | End-of-session leftover recon (optional link to buffet session) |

Phase 1 collates “ingredient issue + FG receipt” into one **atomic** Production Batch post (Odoo-style “produce”).

### 2.8 Costing (Phase 1)

On **POST**:

1. FEFO-consume each component at kitchen store (or global if multistore off)  
2. Sum **actual** ingredient batch costs  
3. Receive FG lot at **unit cost = total ingredient cost ÷ output qty**  
4. One balanced journal (source `INVENTORY_MOVE`): **DR Inventory 1300 / CR Inventory 1300** equal amounts (material reclass; net zero on 1300) so subledger coupling stays honest without inventing COGS/expense  

Scrap outside production is still Loss/Adjustment (ADR-004). **Phase 4** kitchen waste documents use the same P&L accounts (5110/5120 via SHRINKAGE/DAMAGE classifiers) and FEFO consume — operational document only.

### 2.9a Kitchen waste (Phase 4)

| Field / artifact | Meaning |
|------------------|---------|
| `kitchen_waste_documents` | DRAFT → POSTED; types `WASTE_YIELD` \| `CLOSING` |
| `kitchen_waste_lines` | Product qty written off |
| reasons | COOKING_LOSS, LEFTOVER, STAFF_MEAL, SPOILAGE, OVERPRODUCTION, OTHER |
| GL | DR expense (ADR-004 map) / CR 1300; movements `LOSS_DISPOSAL` |
| Buffet close | `POST .../close-with-leftovers` posts CLOSING waste then closes session |

### 2.9 Theoretical BOM reuse

Reuse `product_recipes` / `explodeActiveRecipe` scaling by **output qty** for planned component lines. Actual qty may differ at post. Nesting remains Phase-3-forbidden for recipes; multi-step production uses intermediate FG products (fruit → juice batch → later session uses juice).

### 2.10 Food-cost analytics (Phase 5)

Read-only operational KPIs from kitchen documents (not financial P&L SSOT):

| Endpoint | Content |
|----------|---------|
| `/analytics/summary` | Production $, waste $, cover revenue, food-cost % |
| `/analytics/production-variance` | Planned vs actual ingredient cost per batch |
| `/analytics/waste` | By reason / product |
| `/analytics/buffet` | Session sell-through, revenue, waste, contribution |

UI: `/kitchen/analytics`. Pure helpers in `shared/kitchen-production/analyticsPlan.ts`.

### 2.11 Kitchen Ops Hub (Phase 6)

Operators work from **one central board** (`/kitchen`) with **one-shot mutations** so a single business event does not require multi-page draft → open → post rounds:

| Op | Effect |
|----|--------|
| `POST /ops/quick-produce` | Recipe plan + create + post production (issue + FG receipt) |
| `POST /ops/start-service` | Create buffet session + open for POS covers |
| `POST /ops/quick-waste` | Create + post kitchen waste |
| `POST /ops/end-service` | Optional leftovers + close session |
| `GET /ops/board` | Day board, prepared QOH, open capacity, KPIs, next-action hint |

Document screens remain under `/kitchen/production|buffet-sessions|waste|analytics` for advanced edits. Pure next-action logic: `shared/kitchen-production/opsPlan.ts`.

---

## 3. Non-goals (still out of scope)

- Manufacturing MRP / work centers / routing  
- Multi-level recipe explosion change  
- New warehouse type KITCHEN  
- Replacing sale-time recipe explosion (`AT_SALE`)  
- Replacing financial P&L (`fn_get_profit_loss`) with kitchen food-cost KPIs  
- Automatic per-plate FG issue at cover sale  
- WIP account (optional later)

---

## 4. Write gateway

- Module: `SamplePOS.Server/src/modules/kitchen-production/`  
- API: `/api/kitchen-production`  
- Gateway: `kitchenProductionService` only author for production documents  
- Inventory: `lotService.consumeLot` / `receiveLot` + `stock_movements` with refs  

---

## 5. Consequences

**Positive:** Hotels/buffets/caterers gain cook-to-stock without a factory module; cafés unchanged.  
**Trade-off:** Operators must define FG products and (optionally) recipes; kitchen store discipline is operational.  
**Follow-on:** Domain complete through analytics; further work is operator rollout + optional WIP / multi-level BOM ADRs.
