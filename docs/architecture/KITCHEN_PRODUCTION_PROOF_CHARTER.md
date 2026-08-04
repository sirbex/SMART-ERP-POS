# Kitchen Production — Proof Charter

**Domain:** ADR-005 Kitchen Production (Phases 1–6)  
**Related:** Inventory Lot ADR-002, Loss Quarantine ADR-004  

## Objective

Certify **rollout + end-to-end integrity** of the kitchen document family, including the central ops hub one-shot path:

```
enable flag → seed prepared/cover + AT_PRODUCTION recipe
  → (hub) quick-produce FG (FEFO issue + receipt)
  → (hub) start-service OPEN buffet session
  → sell covers (capacity ledger only)
  → (hub) end-service waste leftovers (LOSS_DISPOSAL)
  → analytics KPIs
```

Document-level advanced screens remain optional.

## Gates

| Gate | Meaning | Harness |
|------|---------|---------|
| **A** | Architecture + pure helpers (Phases 1–6) | Jest `src/modules/kitchen-production/` |
| **B** | Live DB integrity path | `proof-kitchen-production-live.ts` |

## Integrity invariants (Gate B)

| ID | Invariant |
|----|-----------|
| KP-I-1 | Ingredient QOH decreases by batch issue qty |
| KP-I-2 | FG QOH increases by production receipt qty |
| KP-I-3 | FG unit cost ≈ total ingredient cost ÷ output qty |
| KP-I-4 | `PRODUCTION_ISSUE` + `PRODUCTION_RECEIPT` movements tagged `KITCHEN_PRODUCTION` |
| KP-I-5 | Cover sale increments `sold_covers` + cover ledger |
| KP-I-6 | Cover sale does **not** re-consume recipe ingredients |
| KP-I-7 | Waste reduces FG QOH; movements `LOSS_DISPOSAL`; expense 5110 for LEFTOVER |
| KP-I-8 | Waste journal balanced (DR = CR) when ledger present |
| KP-I-9 | Analytics food-cost % coherent with production + waste / cover revenue |

## Commands

```bash
# Full foundation (Jest + live if DATABASE_URL)
npm run proof:kitchen-production-foundation

# Live path only
npm run proof:kitchen-production-live

# Certification (live required)
npm run proof:kitchen-production-certification
```

## Outputs

- `PROOF_KITCHEN_PRODUCTION_FOUNDATION_RUN.md`
- `PROOF_KITCHEN_PRODUCTION_RUN.md` (live detail)

## Non-goals

Replacing financial P&L SSOT; manufacturing MRP; multi-level BOM explosion.
