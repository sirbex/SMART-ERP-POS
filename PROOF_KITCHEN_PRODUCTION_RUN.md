# Kitchen Production — LIVE Integrity Proof

Run: 2026-08-04T05:52:22.183Z
Database: postgresql://postgres:***@localhost:5432/pos_system?schema=public

ADR: docs/architecture/KITCHEN_PRODUCTION_ADR.md

- **PASS** A-db-connect

## Gate A — Migrations 587→590

- **PASS** A-schema-587 — already present
- **PASS** A-schema-588 — already present
- **PASS** A-schema-589 — already present
- **PASS** A-schema-590 — already present
- **PASS** A-table-production
- **PASS** A-col-prepared
- **PASS** A-table-buffet
- **PASS** A-table-waste

## Gate B — Feature flag + seed catalog

- **PASS** B-flag-enabled — was already on
- **PASS** B-user — 7aa55a55-db98-4a9d-a743-d877c7d8dd21
- **PASS** B-kitchen-store — 8e8c1342-6231-4f9d-b857-a9e185ffe389
- **PASS** B-seed-products — ing=a61f39f2 fg=d5e72d0e cover=f080bfbc
- **PASS** B-seed-recipe-AT_PRODUCTION — recipe=ab56ce82 2×ingredient per FG

## Gate C — Seed ingredient stock (receiveLot)

- **PASS** C-ingredient-stock — qoh=25 need>=25

## Gate D — Production batch post (cook-to-stock)

- **PASS** D-batch-posted — KP-2026-00006
- **PASS** D-total-ingredient-cost — 40
- **PASS** D-output-unit-cost-roll-up — got 4 expected ~4
- **PASS** D-movements-PRODUCTION_ISSUE — {"PRODUCTION_ISSUE":1,"PRODUCTION_RECEIPT":1}
- **PASS** D-movements-PRODUCTION_RECEIPT — {"PRODUCTION_ISSUE":1,"PRODUCTION_RECEIPT":1}
- **PASS** D-integrity-ingredient-consumed — before=25 after=5
- **PASS** D-integrity-fg-received — before=0 after=10
- **PASS** D-recipe-mode-AT_PRODUCTION — AT_PRODUCTION

## Gate E — Buffet session OPEN

- **PASS** E-session-open — BF-2026-00006
- **PASS** E-sold-covers-zero

## Gate F — Cover sale (capacity only)

- **PASS** F-createSale-cover — SALE-2026-0175
- **PASS** F-sold-covers-increment — 3
- **PASS** F-cover-ledger-row
- **PASS** F-cover-ledger-qty
- **PASS** F-integrity-no-ingredient-reexplode-on-cover — ing qoh=5

## Gate G — Waste leftovers + close

- **PASS** G-close-with-leftovers — b45df58a-1b80-4d0e-986d-9a3722caa488
- **PASS** G-waste-posted
- **PASS** G-waste-cost-positive — 8
- **PASS** G-expense-5110 — 5110
- **PASS** G-movements-LOSS_DISPOSAL
- **PASS** G-integrity-fg-written-off — before=10 after=8
- **PASS** G-session-closed

## Gate H — Analytics KPIs

- **PASS** H-summary-batches — 6
- **PASS** H-summary-production-cost — 240
- **PASS** H-summary-waste-cost — 48
- **PASS** H-summary-sold-covers — 18
- **PASS** H-summary-cover-revenue — 900
- **PASS** H-food-cost-percent — 32
- **PASS** H-variance-includes-batch
- **PASS** H-variance-actual-cost — 40
- **PASS** H-buffet-session-row
- **PASS** H-buffet-sold — 3
- **PASS** H-buffet-waste-cost — 8
- **PASS** H-kpi-snapshot — foodCost%=32 prod=$240 waste=$48 rev=$900

## Integrity invariants (SSOT)

- **PASS** I-production-journal-linked — 411b281b-e172-47e7-bfe5-d2e771e60694
- **PASS** I-waste-journal-linked — 4994d60f-21e8-48f5-a7f1-98666f092ca8
- **PASS** I-waste-gl-balanced — DR=8 CR=8

## Rollout notes

- kitchen_production_enabled = TRUE
- Products: KP-ING-MSE8R2WN, KP-FG-MSE8R2WN, KP-CV-MSE8R2WN
- Production batch: 987b5929-0397-461f-91d3-a690de748333
- Buffet session: b45df58a-1b80-4d0e-986d-9a3722caa488
- Sale: a4275408-373f-42d4-b46f-4e0fda70ae7d
- Waste: 87fa252e-e58a-4449-bf2e-664a1c28e9ce
- UI: /kitchen/production, /kitchen/buffet-sessions, /kitchen/waste, /kitchen/analytics

---

**Result:** CERTIFIED — 52 pass, 0 fail, 0 skip
