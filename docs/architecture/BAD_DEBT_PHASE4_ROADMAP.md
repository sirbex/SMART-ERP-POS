# Bad Debt Phase 4 — Implementation Roadmap

**Status:** Accepted / Certified — Phases 4A–4E complete  
**ADR:** [BAD_DEBT_ADR.md](./BAD_DEBT_ADR.md)  
**Invariants:** [BAD_DEBT_INVARIANTS.md](./BAD_DEBT_INVARIANTS.md)  
**Proof charter:** [PROOF_BAD_DEBT_CHARTER.md](../../PROOF_BAD_DEBT_CHARTER.md)

**Program context:** Priority #4 in the financial risk order (Treasury → Loss/Quarantine → VAT → **Bad Debt** → Reporting). Phases 1–3 are CERTIFIED; this roadmap covers **Phase 4 only**, milestones **4A–4E**.

**Coding freeze:** Lifted for Accepted Phase 4 deliverables; new AR uncollectible writers must follow ADR-006 / registry.

---

## Milestone map

| Milestone | Name | Primary exit |
|-----------|------|--------------|
| **4A** | Domain foundation | Flag, types, registry, CoA 5210, PostingSource stub |
| **4B** | Write-off posting engine | Document → DR 5210 / CR 1200 + open-item couple |
| **4C** | Ops UI + aging workqueue | Operator path; partial / multi-invoice; reverse |
| **4D** | Governance + recon hardening | Fitness, orphan scan, optional aging lane |
| **4E** | Certification | Proof suite Gates A–E green (or signed waivers) |

Each milestone ships with: schema (if any) · service · API · tests · proof hooks · UI (if user-facing) · permissions · migration notes.

---

## Phase 4A — Domain foundation

### Scope

Lock classifiers and touchpoints; no write-off UI yet.

### Deliverables

| Layer | Work |
|-------|------|
| **Docs** | ADR-006 Accepted (this pack) |
| **Shared** | `shared/bad-debt/` types + invariant asserts (stubs) |
| **Schema** | Feature flag `bad_debt_writeoff_enabled` (default false); seed account **5210**; schema version **550+** |
| **Governance** | `AR_WRITEOFF` PostingSource allow-list stubs on 1200 / 5210 |
| **Registry** | Bad-debt touchpoint registry (CN boundary, balance adjust, recon tip, payments, loss) |
| **Fitness** | `ci:bad-debt-fitness` Gate A partial |

### Exit criteria

- [x] Flag off: no behavior change
- [x] Registry lists every AR-clearing path; no `NOT_STARTED` without owner
- [x] 5210 exists in CoA seed; AccountCodes.BAD_DEBT_EXPENSE wired
- [x] Fitness fails on missing ADR / flag / registry / 5210

**Implemented:** 2026-07-14 — schema `550`, `shared/bad-debt/`, module `modules/bad-debt`, `AR_WRITEOFF` PostingSource, `npm run ci:bad-debt-fitness`.

---

## Phase 4B — Write-off posting engine

### Scope

Single path to recognize uncollectible AR in P&L.

### Deliverables

| Layer | Work |
|-------|------|
| **DB** | `ar_writeoff_documents` + lines + audit |
| **Service** | createDraft / post / reverse; BD-INV-1/2/3/7/9 |
| **API** | `/api/bad-debt/*` behind flag |
| **Coupling** | Invoice residual + customer balance sync in same TX |
| **Tests** | Unit + posting proofs |

### Exit criteria

- [x] Flag on: write-off posts only through gateway
- [x] Over-allocate rejected; concurrent double-write-off safe (advisory locks + ceiling)
- [x] AR integrity holds on fixture (±ε) — settlement SSOT includes write-offs + syncCustomerBalanceFromInvoices
- [x] No CN / MANUAL_JOURNAL path required

**Implemented:** 2026-07-14 — schema `551`, `badDebtService` create/post/reverse, `/api/bad-debt`, settlement include `ar_writeoff_lines`, BD10 MIGRATED.

---

## Phase 4C — Ops UI + aging workqueue

### Scope

Operator workflow for collectors / accountants.

### Deliverables

| Layer | Work |
|-------|------|
| **UI** | Bad Debt workqueue: overdue open invoices → allocate → approve/post |
| **Partial** | Multi-invoice / partial residual write-off |
| **Reverse** | UI to reverse posted write-off |
| **Guardrails** | Clear CN vs write-off messaging |

### Exit criteria

- [x] Happy path + partial + reverse exercised in Gate C (UI + API; posting proofs cover engine)
- [x] Permissions enforced on mutating routes (`accounting.manage` writeoff/reverse; `accounting.read` queue)

**Implemented:** 2026-07-14 — workqueue/documents API, `BadDebtWriteoffPage`, `/accounting/bad-debt` nav, BD13 MIGRATED, CN vs write-off guardrail copy.

---

## Phase 4D — Governance + recon hardening

### Scope

Stop false AR clears; surface write-offs in health views.

### Deliverables

| Layer | Work |
|-------|------|
| **Fitness** | BD-INV-4/5/6 scans (CN reason codes, loss boundary, orphan CR 1200) |
| **Heal/repair** | Never “heal” written-off invoices back open; never invent AR_WRITEOFF |
| **Recon** | Optional write-off / aging exposure lane (informational or materiality) |
| **Period close** | Non-blocking checklist step: review overdue / write-off policy |

### Exit criteria

- [x] Orphan post-cutoff CR 1200 expense writes = 0 (allow-list only) — `scanOrphanArExpenseWriteoffs` + fitness
- [x] Checklist hook present (non-blocking unless product tightens) — `step-bad-debt-writeoff`

**Implemented:** 2026-07-14 — CN uncollectible reason reject (BD-INV-4), loss boundary fitness (BD-INV-5), orphan scan + heal never invents AR_WRITEOFF (BD-INV-6), AR `writeoff` exposure lane, period-close step, BD14–BD16 MIGRATED.

---

## Phase 4E — Certification

### Scope

Run proof charter Gates A–E. **No new features** except harness fixes.

### Exit criteria

- [x] Gates A–E PASS (or accepted waivers) — see [PROOF_BAD_DEBT_RUN.md](../../PROOF_BAD_DEBT_RUN.md)
- [x] `PROOF_BAD_DEBT_RUN.md` published
- [x] ADR status → Accepted / Certified for Phase 4 scope

**Certified:** 2026-07-14 — `npm run proof:bad-debt-certification` → CERTIFIED (waivers BD-D-W01, BD-D-W02).

---

## Explicit non-goals (Phase 4)

- Allowance / ADA provisioning engine (later ADR)
- URA / statutory debt restructuring forms
- Changing CN/DN commercial model
- Inventory loss (ADR-004)
- VAT remittance / WHT TD shim (ADR-005 / T12-W01)
- Cross-domain Phase 5 reporting certification
- Auto-write-off without approval for high amounts

---

## Dependency order

```
ADR + Invariants + Roadmap + Charter Accepted
        │
        ▼
       4A Foundation ──► 4B Posting engine ──► 4C UI / workqueue
                                                      │
                                                      ▼
                                               4D Governance / recon
                                                      │
                                                      ▼
                                               4E Certification
```

4D orphan fitness may start as soon as 4B posts exist.

---

## Backward compatibility

- Flag off: all existing AR / CN / payment behavior unchanged
- Flag on: new write-offs must use `AR_WRITEOFF` document
- Historical “balance adjust only” rows: document + cut off; do not auto-repair into write-offs

---

## Sign-off

| Role | Decision |
|------|----------|
| Finance / product owner | Approve roadmap / Request changes |
| Engineering lead | Approve roadmap / Request changes |
| Architecture | Approve roadmap / Request changes |
