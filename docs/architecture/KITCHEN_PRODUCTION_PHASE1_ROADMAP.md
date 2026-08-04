# Kitchen Production — Phase 1 Roadmap

**ADR:** [KITCHEN_PRODUCTION_ADR.md](./KITCHEN_PRODUCTION_ADR.md)

## Goal

Ship **Production Batch** (cook-to-stock): draft → post → ingredients FEFO consumed → finished-good lot received → inventory reclass GL.

## Deliverables

| # | Deliverable | Done when |
|---|-------------|-----------|
| 1 | ADR accepted | This ADR + roadmap |
| 2 | Migration 587 | Tables, flag, RBAC, movement types |
| 3 | Shared pure plan + types | Mode/doc invariants |
| 4 | Service post path | Atomic LUW issue + receive + GL |
| 5 | REST API | CRUD draft + post + list |
| 6 | Minimal workspace UI | List + create + post |
| 7 | Architecture proof tests | Structure/SSOT locked |

## Explicit non-goals Phase 1

Sessions, multi-output batches, waste docs, new store_type, UI for full chef “today’s menu” ops suite.

## Later phases

| Phase | Focus | Status |
|-------|--------|--------|
| 2 | Prepared-food catalog UX / defaults | See [PHASE2](./KITCHEN_PRODUCTION_PHASE2_ROADMAP.md) |
| 3 | Buffet Session documents + cover sales | Not started |
| 4 | Yield & waste documents | Not started |
| 5 | Food-cost analytics | Not started |
