# Inventory Lot Foundation — Certification Charter

**Phase:** Architecture Certification (post-Proof)  
**ADR:** [INVENTORY_LOT_DOMAIN_ADR.md](./docs/architecture/INVENTORY_LOT_DOMAIN_ADR.md)  
**Invariants:** [INVENTORY_LOT_INVARIANTS.md](./docs/architecture/INVENTORY_LOT_INVARIANTS.md)  
**Operational proof:** [PROOF_INVENTORY_LOT_FOUNDATION.md](./PROOF_INVENTORY_LOT_FOUNDATION.md)

Certification is **continuous** — every release must earn it. Deployment stops if Inventory Certification fails.

---

## Release pipeline position

```
Compile → Tests → Inventory Certification → GL Certification → Financial Certification → Deploy
```

Commands:

```bash
# Per-PR (merge blocked on failure)
npm run ci:inventory-lot-guardrails
npm run ci:inventory-lot-fitness

# Foundation proof (Gates A–D + J)
npm run proof:inventory-lot-foundation

# Strict certification (zero debt tolerance)
npm run proof:inventory-lot-certification
```

---

## Proof gates

| Gate | Scope | Status |
|------|-------|--------|
| **A** | Architecture — touchpoints, migration registry | Automated |
| **B** | Data integrity — invariants INV-001–003 SQL | Automated (DB) |
| **C** | Performance — FEFO determinism + scale | Partial (staging pending) |
| **D** | Concurrency — locks, races | Partial (staging pending) |
| **E** | Recovery — crash/rollback/retry/idempotency | **Not started** |
| **F** | Upgrade — schema migrations preserve lot state | **Not started** |
| **G** | Disaster recovery — backup restore + replay | **Not started** |
| **H** | Audit — full lot lineage | **Not started** |
| **I** | Scale — 100k / 250k / 1M lots | **Not started** |
| **J** | Architectural integrity — fitness functions | Automated (PR) |

---

## Gate J — Architectural fitness functions

Every PR runs `ci:inventory-lot-fitness.mjs`:

| Check | Blocks merge |
|-------|----------------|
| J-01 No direct `inventory_batches` writes outside gateway | New violations |
| J-02 No duplicate `days_until_expiry` SQL | Yes |
| J-03 No duplicate FEFO ordering outside canonical engines | New violations |
| J-04 No lot expiry writes outside gateway | Yes |
| J-05 No `NOT_STARTED` touchpoints | Strict mode only |
| J-06 Zero `PENDING_ARCHITECTURAL_DEBT` entries | Strict mode only |
| J-07 Shared SSOT modules present | Yes |
| J-08 Gateway does not import debt-target modules | Yes |

Strict mode: `LOT_CERTIFICATION_STRICT=1` — warnings become failures.

---

## Domain invariants (prevent + detect)

| ID | Rule | Enforced |
|----|------|----------|
| INV-001 | Projection → exactly one master | Gate B SQL + LotService |
| INV-002 | Master qty = sum(projections) | Gate B SQL |
| INV-003 | Quantity never negative | Gate B SQL + fail-closed consume |
| INV-004 | Disposed/archived cannot receive | `lotService` runtime |
| INV-005 | Recalled/quarantined need override to allocate | Selection + runtime |
| INV-006 | Expiry cannot move backwards without approval | `correctLotAttributes` |
| INV-007 | Transfer preserves lot identity | `transferLot` (when built) |

**Zero tolerance:** orphan rows = certification FAIL (no longer informational).

---

## Exit criteria (all must be green)

| Requirement | Target | Current |
|-------------|--------|---------|
| W01–W22 migrated | 100% | W18/W22 deferred (ADR); **W19–W21 migrated** |
| Pending architectural debt | **0** | **0** ✓ |
| Orphan rows | **0** | **0** ✓ |
| Strict certification | PASS | `npm run proof:inventory-lot-certification` — 9/9 PASS |
| Expiry drift | **0** | 0 |
| Negative quantities | **0** | 0 |
| Duplicate expiry logic | **0** | 0 (new blocked) |
| Duplicate FEFO logic | **0** | grandfathered reads |
| Direct inventory writes | **0** | 3 workflows |
| Architectural rule violations | **0** | debt tracked |
| Proof gates A–J | **PASS** | **A, B, J PASS**; C/D partial; E–I pending |
| ADR approved | YES | Proposed |
| CI certification | PASS | PR fitness passes |
| Staging certification | PASS | Pending |
| Production readiness review | PASS | Pending |

**Verdict: NOT CERTIFIED**

---

## Certification sprint (ordered)

1. ~~Migrate W19–W21 → `LotService`; shrink `PENDING_ARCHITECTURAL_DEBT`~~ **Done**
2. ~~Resolve orphan `product_lots` row; enforce INV-001 at proof + runtime~~ **Done**
3. **Next:** Clear remaining architectural debt (7 items) OR reclassify N/A paths (inventorySync, goodsReceiptRepository draft lines, coupling repair)
4. Staging Gates C + D (performance + live concurrency)
5. Build Gates E–I proof suites
6. Run `npm run proof:inventory-lot-certification`
7. Publish green certification report → **freeze** `modules/inventory-lot/` + `shared/inventory-lot/`

---

## Post-certification rule

No new capabilities (dashboards, WMS, manufacturing, quality) until certification is green.

All domains consume the foundation — nobody edits it casually.

---

## Replicate across ERP foundations

Apply this pattern to:

- General Ledger Foundation
- Accounts Receivable Foundation
- Accounts Payable Foundation
- Warehouse Foundation
- Sales / POS / Purchasing / Manufacturing Foundations

Each: ADR · SSOT · Invariants · Write gateway · Shared rules · CI fitness · Proofs · Gates A–J · Continuous certification.
