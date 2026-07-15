# VAT Remittance Phase 3 — Implementation Roadmap

**Status:** Accepted — Phase 3 CERTIFIED (3A–3E; open waivers documented)  
**ADR:** [VAT_REMITTANCE_ADR.md](./VAT_REMITTANCE_ADR.md)  
**Invariants:** [VAT_REMITTANCE_INVARIANTS.md](./VAT_REMITTANCE_INVARIANTS.md)  
**Proof charter:** [PROOF_VAT_REMITTANCE_CHARTER.md](../../PROOF_VAT_REMITTANCE_CHARTER.md)

**Program context:** Priority #3 in the financial risk order (Treasury → Loss/Quarantine → **VAT** → Bad Debt → Reporting). Phases 1–2 are CERTIFIED; this roadmap covers **Phase 3 only**, milestones **3A–3E**.

**Coding freeze:** Lifted for Accepted Phase 3 deliverables; new VAT cash writers must follow ADR-005 / registry.

---

## Milestone overview

| Milestone | Name | Primary invariants |
|-----------|------|--------------------|
| **3A** | Domain foundation | Registry; types; flag; posting source; VR-INV-4/5/6/9 stubs |
| **3B** | Accrual honesty / recon contract | VR-INV-3; purchase VAT decision; optional VAT lane |
| **3C** | Remittance posting engine | VR-INV-1/2/7/8; TD `VAT_REMITTANCE` |
| **3D** | Compliance package + WHT boundary | VR-INV-9/10; period-close; WHT-TD shim or waiver |
| **3E** | Certification | Gates A–E full PASS (or signed waivers) |

---

## Phase 3A — Domain foundation

### Scope

Lock classifiers and touchpoints; no remittance UI yet.

### Deliverables

| Layer | Work |
|-------|------|
| **Docs** | ADR-005 Accepted (this pack) |
| **Shared** | `shared/vat-remittance/` types + invariant asserts (stubs) |
| **Schema** | Feature flag `vat_remittance_document_enabled` (default false); any remittance metadata columns on TD if needed |
| **Governance** | `VAT_REMITTANCE` PostingSource in Rule D allow-list |
| **Registry** | VAT touchpoint registry (sale/CN/DN/bill/report/remit writers) — mirror LQ/Treasury |
| **Fitness** | `ci:vat-remittance-fitness` Gate A partial |

### Exit criteria

- [x] Flag off: no behavior change
- [x] Registry lists accrual + remittance writers; no `NOT_STARTED` without owner
- [x] Fitness fails on missing ADR / Rule D VAT allow-list / schema 548

**Implemented:** 2026-07-12 — schema `548` `vat_remittance_document_enabled`; `shared/vat-remittance/`; touchpoint registry VR01–VR12; `VAT_REMITTANCE` PostingSource Rule D; `npm run ci:vat-remittance-fitness`.

---

## Phase 3B — Accrual honesty / recon contract

### Scope

Make document boxes and GL 2300 an honest pair (or waive with proof).

### Deliverables

| Layer | Work |
|-------|------|
| **Decision** | Document choice: (A) post Input VAT on supplier bills into 2300, or (B) remittance uses document return + GL recon with known inventory-embedded input |
| **Config** | Fix `tax_receivable_account` / product VAT defaults away from WHT **1250** (VR-INV-6) |
| **Recon** | VAT integrity or cache lane: document net vs GL 2300 (informational or period-close per materiality) |
| **Proof** | Gate B drift probe baseline |

### Exit criteria

- [x] Written 3B decision recorded in ADR appendix or roadmap note
- [x] VR-INV-6 green in fitness
- [x] Recon probe exists (lane or SQL)

**Implemented:** 2026-07-12 — **Decision B** (ADR Appendix A); schema `549` VR-INV-6; VAT integrity lane `vat` domain (informational); `GET /api/erp-accounting/reconciliation/vat/integrity`.

---

## Phase 3C — Remittance posting engine

### Scope

Authority settlement via Treasury Document.

### Deliverables

| Layer | Work |
|-------|------|
| **Service** | Create/post `VAT_REMITTANCE` TD: DR 2300 / CR liquidity; ceiling; immutability; reverse |
| **API / UI** | Period worksheet: boxes preview, payable, amount, bank/cash, authority ref |
| **Idempotency** | Concurrent double-remit → one success |
| **Tests** | Coupling, over-remit reject, reverse restores 2300 |

### Exit criteria

- [x] Flag on: remittance posts only through TD gateway
- [x] VR-INV-1/2/7 proven in unit + structural concurrency
- [x] No MANUAL_JOURNAL path for VAT cash

**Implemented:** 2026-07-12 — `createAndPostVatRemittance` / `reverseVatRemittance`; `postingSourceForDocumentType` → `VAT_REMITTANCE`; API `/api/vat-remittance/*`; UI `/accounting/vat-remittance`; VR08/T13 MIGRATED.

---

## Phase 3D — Compliance package + WHT boundary

### Scope

Wire settled amounts and period close; keep WHT separate.

### Deliverables

| Layer | Work |
|-------|------|
| **Reports** | Tax compliance liability “settled” ← posted `VAT_REMITTANCE` (VR-INV-10) |
| **Period close** | Checklist step for VAT payable / remittance (non-blocking or materiality) |
| **WHT** | Explicit: leave T12 DEFERRED with waiver **or** shim `remitWht` → `WHT_REMITTANCE` TD |
| **Fitness** | VR-INV-9 cross-call scan |

### Exit criteria

- [x] Settled column matches TD sum (±ε) — `getTaxLiabilityReport` uses `sumPostedVatRemittances` (VR-INV-10)
- [x] WHT remit still works; no shared posting source — T12 left DEFERRED with waiver **T12-W01** (expires 2026-09-30); VR-INV-9 fitness scan
- [x] Period-close hook present — `step-vat-remittance` on close checklist (non-blocking)

**Implemented:** 2026-07-14 — VR06/VR13 MIGRATED; settled SSOT module `vatRemittanceSettled.ts`; fitness Gate A/B/E 3D checks.

---

## Phase 3E — Certification

### Scope

Run proof charter Gates A–E. **No new features** except harness fixes.

### Exit criteria

- [x] Gates A–E PASS (or accepted waivers)
- [x] `PROOF_VAT_REMITTANCE_RUN.md` published
- [x] ADR status → Accepted / Certified for Phase 3 scope

**Certified:** 2026-07-14 — `npm run proof:vat-remittance-foundation` → CERTIFIED (waivers VR-INV-3-B, VR-D-W01, T12-W01).

---

## Explicit non-goals (Phase 3)

- Bad debt AR write-off (Phase 4)
- Cross-domain reporting cert (Phase 5)
- URA e-filing / EFRIS
- Redesign Tax Engine rates
- Mandatory Output/Input CoA split

---

## Dependency order

```
ADR + Invariants + Roadmap + Charter Accepted
        │
        ▼
       3A Foundation ──► 3B Accrual honesty ──► 3C Remittance engine
                                                      │
                                                      ▼
                                               3D Compliance / WHT boundary
                                                      │
                                                      ▼
                                               3E Certification
```

3B may start analysis in parallel with 3A registry work; **do not** ship remittance UI before 3B decision is recorded.

---

## Backward compatibility

- Flag off: existing tax reports + WHT remit unchanged; no TD required for VAT cash (none exists today)
- Flag on: new remittances must use `VAT_REMITTANCE` TD

---

## Sign-off

| Role | Decision |
|------|----------|
| Finance / product owner | Approve roadmap / Request changes |
| Engineering lead | Approve roadmap / Request changes |
| Architecture | Approve roadmap / Request changes |
