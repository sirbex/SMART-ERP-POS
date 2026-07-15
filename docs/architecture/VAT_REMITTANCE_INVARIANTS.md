# VAT Remittance Domain Invariants

**Status:** Accepted — certification contract (ADR-005 Phase 3A open)  
**ADR:** [VAT_REMITTANCE_ADR.md](./VAT_REMITTANCE_ADR.md)  
**Enforcement (planned):** `shared/vat-remittance/` · Treasury VAT remittance gateway · Gate B SQL · Gate A/E fitness · Rule D posting sources

These are **contractual domain rules**. Any violation blocks Phase 3 certification.

---

## Invariant summary

| ID | Rule | Violation |
|----|------|-----------|
| **VR-INV-1** | Posted `VAT_REMITTANCE` TD posts exactly one balanced journal (DR 2300 / CR liquidity) | Certification **FAIL** |
| **VR-INV-2** | Remittance amount cannot exceed available VAT payable (ceiling) | Runtime reject + **FAIL** |
| **VR-INV-3** | Document VAT return boxes and GL 2300 must reconcile within materiality (or signed waive) | Certification **FAIL** / waive |
| **VR-INV-4** | No liquidity credit for VAT settlement without `VAT_REMITTANCE` TD (or allow-listed legacy cutoff) | Certification **FAIL** |
| **VR-INV-5** | WHT accounts **1250/2350** are off-limits to VAT remittance journals | Runtime reject + **FAIL** |
| **VR-INV-6** | Product VAT must not default/post to WHT receivable **1250** | Fitness + **FAIL** |
| **VR-INV-7** | Posted remittance TDs are immutable; corrections = reversal TD | Runtime reject + **FAIL** |
| **VR-INV-8** | Every remittance is auditable (who/when/period/authority ref/journal/TD id) | Certification **FAIL** |
| **VR-INV-9** | VAT remittance and WHT remit/recover never share UI action or posting source | Fitness **FAIL** |
| **VR-INV-10** | Tax compliance “settled” for VAT includes only posted `VAT_REMITTANCE` (and reversals) | Certification **FAIL** |

---

## VR-INV-1 — Balanced remittance journal

```
∀ TreasuryDocument WHERE type = VAT_REMITTANCE AND status = POSTED:
  journalEntryId IS NOT NULL
  AND Σ(debit) = Σ(credit)
  AND journal clears Tax Payable 2300 (net DR)
  AND journal credits a liquidity-tagged account
```

**Proof:** Gate B SQL + posting unit tests.

---

## VR-INV-2 — Remittance ceiling

```
∀ VAT_REMITTANCE amount A for period P:
  A ≤ availableVatPayable(P)
```

`availableVatPayable` is defined in the remittance service as: GL net 2300 credit balance in scope **minus** already-remitted (posted, non-reversed) amounts overlapping the policy window — or an explicitly documented equivalent. Over-remit → **REJECT**.

**Proof:** Unit tests + Gate C over-remit scenario.

---

## VR-INV-3 — Document boxes ↔ GL 2300

```
∀ tax period P at certification:
  | documentNetVatBoxes(P) − gl2300Movement(P) | ≤ materiality
  OR signed waiver with expiry + owner
```

Purchase-bill honesty (Phase 3B) is the primary lever if drift is structural.

**Proof:** Gate B recon probe + optional VAT integrity lane.

---

## VR-INV-4 — No orphan VAT cash settlement

```
∀ POSTED journal that DR 2300 AND CR liquidity for VAT authority settlement
  (post-cutoff):
  must reference TreasuryDocumentId of type VAT_REMITTANCE
```

Allow-list: pre-cutoff legacy, test fixtures, signed remediation scripts only.

**Proof:** Gate A fitness + Gate B orphan scan.

---

## VR-INV-5 — WHT accounts off-limits

```
∀ VAT_REMITTANCE journal line:
  accountCode ∉ {1250, 2350}
```

**Proof:** Runtime assert + unit tests.

---

## VR-INV-6 — No WHT collision on product VAT config

```
tax_definitions defaults / product VAT receivable mapping
  must not use 1250 for Input VAT semantics
```

**Proof:** Schema/seed fitness + Tax Engine config guard.

---

## VR-INV-7 — Immutability

Same contract as TD-INV-3 for `VAT_REMITTANCE` documents.

**Proof:** Service tests + Gate E.

---

## VR-INV-8 — Audit pack

```
∀ POSTED VAT_REMITTANCE:
  created_by, posted_at, journal_entry_id,
  period bounds, remittance amount, liquidity account,
  optional authority_reference — all present
```

**Proof:** Gate B null checks + Gate E export path.

---

## VR-INV-9 — WHT / VAT separation

```
VAT remittance UI/API must not call remitWht / recoverWht
WHT remittance UI/API must not create VAT_REMITTANCE TDs
PostingSource VAT_REMITTANCE ≠ WHT_REMITTANCE
```

**Proof:** Gate A fitness + architecture proof.

---

## VR-INV-10 — Settled amount SSOT

```
tax compliance VAT “settled in period”
  = Σ(posted VAT_REMITTANCE amounts) − Σ(reversals)
  for journals/docs overlapping the period
```

**Proof:** Report unit + Gate C after remittance post.

---

## Invariant → gate mapping

| Invariant | Primary gate |
|-----------|--------------|
| VR-INV-1 | B, C |
| VR-INV-2 | C |
| VR-INV-3 | B, D optional lane |
| VR-INV-4 | A, B |
| VR-INV-5 | A, C |
| VR-INV-6 | A |
| VR-INV-7 | E |
| VR-INV-8 | E |
| VR-INV-9 | A |
| VR-INV-10 | B, C |

---

## Sign-off

| Role | Decision |
|------|----------|
| Finance / product owner | Approve / Request changes |
| Engineering lead | Approve / Request changes |
| Architecture | Approve / Request changes |
