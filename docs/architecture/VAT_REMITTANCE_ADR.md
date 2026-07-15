# ADR-005 — VAT Remittance Domain Foundation

**Status:** Accepted — Phase 3 CERTIFIED (Gates A–E; see [PROOF_VAT_REMITTANCE_RUN.md](../../PROOF_VAT_REMITTANCE_RUN.md))  
**Date:** 2026-07-12  
**Program priority:** #3 after Treasury (ADR-003 CERTIFIED) and Loss/Quarantine (ADR-004 CERTIFIED)  
**Related:** [TREASURY_DOCUMENT_ADR.md](./TREASURY_DOCUMENT_ADR.md), [LOSS_QUARANTINE_ADR.md](./LOSS_QUARANTINE_ADR.md), [PROOF_TAX_COMPLIANCE.md](../../PROOF_TAX_COMPLIANCE.md)  
**Invariants:** [VAT_REMITTANCE_INVARIANTS.md](./VAT_REMITTANCE_INVARIANTS.md)  
**Roadmap:** [VAT_REMITTANCE_PHASE3_ROADMAP.md](./VAT_REMITTANCE_PHASE3_ROADMAP.md)  
**Proof charter:** [PROOF_VAT_REMITTANCE_CHARTER.md](../../PROOF_VAT_REMITTANCE_CHARTER.md)

**Accepted:** 2026-07-12 — Phase 3A open.  
**Certified:** 2026-07-14 — Phase 3A–3E with waivers VR-INV-3-B, VR-D-W01, T12-W01.

---

## 0. Objective (freeze statement)

**Freeze VAT around two distinct economic events:**

1. **Accrual** — document + GL recognition of output/input tax into the net Tax Payable control (**2300**). Product VAT stays on `tax_definitions` / Tax Engine; sales, CN/DN, and (when honest) purchase paths post into 2300.
2. **Remittance** — authority settlement that clears **2300** against liquidity via Treasury Document type **`VAT_REMITTANCE`** under a governed posting source. Corrections = reversal TD (or governed reverse), never silent edits.

Payment WHT stays on `withholding_tax_types` / **1250|2350** and must not share remittance UI, posting source, or control accounts with VAT.

Complete this ADR, the invariants, Phase 3 roadmap, and proof charter **before** building remittance worksheets or new VAT cash journals. **No new feature may invent a parallel VAT cash journal path, remit WHT from a VAT screen, or treat document VAT boxes and GL 2300 as interchangeable without an explicit reconciliation contract.**

---

## 1. Context

| Today | Problem |
|-------|---------|
| Sales / customer CN-DN | Post VAT to **2300** (net control) — good accrual path |
| Supplier invoices | Often post `totalAmount` only (GRIR/Expense ↔ AP) — **input VAT may never hit 2300** |
| Tax Engine | Computes rates; `taxReceivableAccountCode` aspirational; defaults collide with WHT **1250** naming |
| Tax compliance reports | Document VAT boxes + 2300 rollforward exist; **settled** amount not wired to a remittance document |
| WHT remit/recover | Full lifecycle on 2350/1250 with governed sources — **not** a TD yet (T12 DEFERRED) |
| `VAT_REMITTANCE` TD type | Reserved in ADR-003 / schema 541; touchpoint **T13 DEFERRED**; no service/UI |
| No VAT recon lane | WHT has integrity lanes; VAT has report math only |

Enterprise pattern (QB sales tax payable, Odoo tax return, SAP tax payable remittance):

> **Accrue on control. Remit via treasury settlement document. Reconcile return boxes to GL.**

This ADR adopts that split on SamplePOS’s existing **net 2300** chart (not a new Output/Input CoA split in Phase 3).

---

## 2. Decision summary

| Question | Decision |
|----------|----------|
| **Canonical remittance object** | Treasury Document type **`VAT_REMITTANCE`** (ADR-003). GL journals reference the TD. |
| **VAT control account** | **2300 Tax Payable** — net output − input. Do **not** invent active Input VAT **1400** or reuse **1250** for product VAT in Phase 3. |
| **WHT boundary** | **1250 / 2350** only. Separate remittance type `WHT_REMITTANCE` (shim migrate optional; not a redesign). |
| **Remittance SSOT for “how much to pay”** | Worksheet amount ≤ **available VAT payable** per remittance policy (see invariants). Document return boxes and GL 2300 must be reconcilable (lane or certified waive). |
| **Write gateway** | `TreasuryService` (or thin VAT remittance service that **only** creates/posts TDs). No ad-hoc `MANUAL_JOURNAL` cash credits. |
| **Posting shape** | DR **2300** / CR liquidity (1010/1030/…); fees as separate lines if needed. |
| **Refund / recoverable net** | Optional later TD type `VAT_REFUND` (or negative remittance policy). Phase 3A–3C may defer refund UI with explicit waiver. |
| **Product Tax Engine** | Remains accrual calculator; Phase 3 does **not** redesign rates/inclusive math. |
| **Governance** | Add `VAT_REMITTANCE` (and optional `VAT_REFUND`) to Rule D allow-list for cash credits / 2300 clears. |

### 2.1 Rejected alternatives

❌ *"Add a one-off VAT remit button that posts like WHT without a TD."*  
Breaks ADR-003 freeze and creates a third remittance path.

❌ *"Split CoA into Output 23xx + Input 14xx in the same phase as remittance UI."*  
High migration cost; current reality is net 2300. Chart split is an optional later ADR.

❌ *"Remit from document boxes only and ignore GL 2300."*  
Leaves control-account drift invisible at period close.

❌ *"Use Tax Receivable 1250 for Input VAT."*  
Collides with customer WHT receivable.

---

## 3. Business object model

```
VAT Accrual (existing domains)
  ├── Sale / POS / invoice tax lines → CR 2300
  ├── Customer CN/DN tax → DR/CR 2300
  ├── Supplier CN/DN tax → DR/CR 2300 (as today)
  └── Supplier bill VAT → [Phase 3B honesty decision]

VAT Remittance (Phase 3)
  └── TreasuryDocument type = VAT_REMITTANCE
        ├── periodFrom / periodTo (or tax period key)
        ├── remittanceAmount
        ├── liquidityAccountId
        ├── authorityReference (URA / receipt #)
        ├── journalEntryId
        └── lines: DR 2300, CR cash/bank [, fee]

Tax compliance report
  └── Boxes (document) ↔ Liability rollforward (2300) ↔ Settled (sum posted VAT_REMITTANCE)
```

---

## 4. Explicit non-goals (Phase 3)

- Rebuild WHT types, payment splits, certificates, or recon lanes
- Bad debt / AR write-off (Phase 4)
- Cross-domain reporting certification (Phase 5)
- URA e-filing / EFRIS adapters
- Product Tax Engine redesign
- Inventory scrap/VAT interaction (Loss ADR)
- Mandatory CoA split to separate Input VAT asset

---

## 5. Follow-on

| Phase | Topic |
|-------|-------|
| **3A–3E** | This roadmap (foundation → accrual honesty → remittance engine → compliance package → certification) |
| **4** | Bad Debt Workflow |
| **5** | Cross-domain reporting |

Optional same-phase or deferred: shim `whtService.remitWht` onto `WHT_REMITTANCE` TD (T12) — tracked as allow-listed DEFERRED with expiry if not done in 3D.

---

## 6. Acceptance

| Role | Decision |
|------|----------|
| Finance / product owner | Approve ADR / Request changes |
| Engineering lead | Approve ADR / Request changes |
| Architecture | Approve ADR / Request changes |

Once ADR + Invariants + Roadmap + Charter are **Accepted**, flip status and open **Phase 3A** implementation.

**Accepted:** 2026-07-12 — Phase 3A open.

---

## Appendix A — Phase 3B accrual honesty decision

**Decision B (locked 2026-07-12):**

1. **Remittance SSOT for “how much to pay”** = tax compliance **document VAT boxes** (net output − net input).
2. **GL 2300** remains the remittance clearing control for amounts accrued there (sales / CN-DN paths).
3. **Supplier bills** continue to post `totalAmount` to GRIR/Expense ↔ AP without splitting Input VAT onto 2300 in Phase 3. Purchase input on the return may therefore exceed GL input credits — expected **informational** drift on the VAT integrity lane (`GET .../reconciliation/vat/integrity`). Does **not** block period close.
4. **Option A** (post Input VAT on supplier bills into 2300) is deferred; tracked as follow-on after remittance engine if finance requires GL≡return without reconciling explanation.
5. **VR-INV-6:** product VAT `tax_receivable_account` defaults to / uses **2300**, never WHT **1250** (schema `549`).
