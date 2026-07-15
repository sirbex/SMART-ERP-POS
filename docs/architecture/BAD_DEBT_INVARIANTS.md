# Bad Debt (AR Write-off) Domain Invariants

**Status:** Accepted / Certified — certification contract (ADR-006 Phase 4)  
**ADR:** [BAD_DEBT_ADR.md](./BAD_DEBT_ADR.md)  
**Enforcement:** `shared/bad-debt/` · `BadDebtService` · Gate B SQL · Gate A/E fitness · Rule A/C posting sources · `PROOF_BAD_DEBT_RUN.md`

These are **contractual domain rules**. Any violation blocks Phase 4 certification.

---

## Invariant summary

| ID | Rule | Violation |
|----|------|-----------|
| **BD-INV-1** | Posted write-off posts exactly one balanced journal (DR Bad Debt Expense / CR 1200) | Certification **FAIL** |
| **BD-INV-2** | Write-off amount cannot exceed invoice / customer open residual (ceiling) | Runtime reject + **FAIL** |
| **BD-INV-3** | Open-item residual and customer balance update in the **same transaction** as the journal | Certification **FAIL** |
| **BD-INV-4** | Credit notes (4010 path) must not be used as uncollectible write-offs | Fitness + **FAIL** |
| **BD-INV-5** | Inventory loss accounts **5110/5120/5130** and Loss Disposal docs never clear 1200 | Runtime + **FAIL** |
| **BD-INV-6** | No MANUAL_JOURNAL (or non-allow-listed source) may credit 1200 for write-off post-cutoff | Certification **FAIL** |
| **BD-INV-7** | Posted write-offs are immutable; corrections = reversal document | Runtime reject + **FAIL** |
| **BD-INV-8** | Every write-off is auditable (who/when/customer/invoices/amount/reason/journal/doc id) | Certification **FAIL** |
| **BD-INV-9** | Expense posts to Bad Debt Expense (**5210** or mapped equivalent), not Sales Returns **4010** or generic **6900** by default | Runtime + **FAIL** |
| **BD-INV-10** | AR integrity: GL 1200 vs open-item remains reconcilable after write-off (±ε) | Certification **FAIL** |

---

## BD-INV-1 — Balanced journal

```
∀ ArWriteoffDocument WHERE status = POSTED:
  journalEntryId IS NOT NULL
  AND Σ(debit) = Σ(credit)
  AND net CR 1200 = total write-off amount
  AND net DR expense (5210 or mapped) = total write-off amount
  (unless signed Decision B VAT split is enabled)
```

**Proof:** Gate B SQL + posting unit tests.

---

## BD-INV-2 — Settlement ceiling

```
∀ allocation line L on invoice I:
  L.writeoffAmount ≤ I.openResidualAtPost
  AND Σ(allocations on I across POSTED write-offs) ≤ I.originalOpenEligible
```

Concurrent double-write-off → one success; residual never negative.

**Proof:** Gate C concurrency + service tests.

---

## BD-INV-3 — Subledger coupling

```
∀ POSTED write-off W:
  in same DB transaction as journal:
    invoice residuals reduced by allocation amounts
    AND customer balance recomputed from open invoices (SSOT sync)
```

No “GL only” or “balance only” path.

**Proof:** Integration / coupling tests + Gate B.

---

## BD-INV-4 — CN boundary

```
Customer credit note path MUST NOT accept reasonCode ∈ BAD_DEBT_UNCOLLECTIBLE
Fitness fails if CN service creates AR_WRITEOFF posting source or vice versa
```

Operators use CN for commercial corrections; Bad Debt UI for uncollectibles.

**Proof:** Gate A fitness + architecture proof.

---

## BD-INV-5 — Inventory boundary

```
LOSS_DISPOSAL / inventory WRITE_OFF reasons never post to 1200
AR_WRITEOFF never posts to 1300 / 5110 / 5120 / 5130
```

**Proof:** Gate A registry + unit asserts.

---

## BD-INV-6 — No orphan AR write-off journals

```
∀ POSTED journal that CR 1200 AND DR expense for uncollectible settlement (post-cutoff):
  must reference ArWriteoffDocumentId
  OR be on the allow-list (legacy cutoff, SYSTEM_CORRECTION recon tip < materiality, tests)
```

**Not allow-listed:** MANUAL_JOURNAL; ad-hoc balance adjust without GL; CN labeled as write-off.

**Proof:** Gate B orphan scan + Gate A fitness.

---

## BD-INV-7 — Immutability

Posted headers/lines/amounts immutable. Correction = `AR_WRITEOFF_REVERSAL` restoring residual + reversing journal.

**Proof:** Service tests + Gate E.

---

## BD-INV-8 — Audit pack

```
∀ POSTED write-off:
  created_by, posted_at, journal_entry_id, customer_id,
  reason_code, total_amount, expense_account, allocation lines — present
```

**Proof:** Gate E export + null SQL checks.

---

## BD-INV-9 — Expense account honesty

Default expense = **5210**. Reject 4010 (contra-revenue) and reject 6900 unless signed waiver for tip-sized residuals outside this domain.

**Proof:** Runtime assert + fitness CoA seed.

---

## BD-INV-10 — AR integrity after write-off

```
After POSTED write-off(s):
  | GL 1200 net − open invoice residual sum | ≤ materiality
```

**Proof:** Gate B / existing AR integrity lane on fixtures.

---

## Invariant → gate mapping

| Invariant | Primary gate |
|-----------|--------------|
| BD-INV-1 | B, C |
| BD-INV-2 | C |
| BD-INV-3 | B, C |
| BD-INV-4 | A |
| BD-INV-5 | A |
| BD-INV-6 | A, B |
| BD-INV-7 | E |
| BD-INV-8 | E |
| BD-INV-9 | A, C |
| BD-INV-10 | B |

---

## Sign-off

| Role | Decision |
|------|----------|
| Finance / product owner | Approve / Request changes |
| Engineering lead | Approve / Request changes |
| Architecture | Approve / Request changes |
