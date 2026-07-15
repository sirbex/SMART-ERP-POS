# Treasury Document Domain Invariants

**Status:** Accepted — certification contract (ADR-003 Phase 1 CERTIFIED)  
**ADR:** [TREASURY_DOCUMENT_ADR.md](./TREASURY_DOCUMENT_ADR.md)  
**Enforcement:** `shared/treasury/treasuryInvariants.ts` · `TreasuryService` (runtime) · Gate B SQL (data) · Gate A/E fitness (architecture)

These are **contractual domain rules**, not test-only expectations. Any violation blocks Treasury Document certification.

---

## Invariant summary

| ID | Rule | Violation |
|----|------|-----------|
| **TD-INV-1** | Every posted Treasury Document posts exactly one balanced journal | Certification **FAIL** |
| **TD-INV-2** | Every liquidity *movement* (settlement / transfer / petty / remittance) references exactly one Treasury Document | Certification **FAIL** |
| **TD-INV-3** | Posted Treasury Documents are immutable; corrections require reversal documents | Runtime reject + **FAIL** |
| **TD-INV-4** | Settlement cannot exceed the originating amount | Runtime reject + **FAIL** |
| **TD-INV-5** | Deposit Worksheets can only consume unsettled receipts | Runtime reject + **FAIL** |
| **TD-INV-6** | Treasury Transfers must use liquidity-tagged accounts only | Runtime reject + **FAIL** |
| **TD-INV-7** | Every Treasury Document is fully auditable (creator, approver, timestamps, journal IDs) | Certification **FAIL** |
| **TD-INV-8** | No GL journal affecting liquidity may exist without a Treasury Document reference (allow-listed exceptions only) | Certification **FAIL** |

---

## TD-INV-1 — Balanced journal per document

```
∀ TreasuryDocument WHERE status = POSTED:
  journalEntryId IS NOT NULL
  AND Σ(journal.debit) = Σ(journal.credit)
  AND exactly one journal is linked as the posting journal
```

Reversal documents also satisfy TD-INV-1 with their own journal.

**Proof:** Gate B SQL + post-path unit tests.

---

## TD-INV-2 — One document per liquidity movement

```
∀ liquidity movement event M (deposit worksheet line settlement,
  transfer, petty cash post, cash withdrawal/deposit,
  card/MoMo settlement, WHT/VAT remittance):
  M.treasuryDocumentId IS NOT NULL
  AND count(distinct treasuryDocumentId) = 1
```

**Not in scope of TD-INV-2:** originating `PAYMENT_RECEIPT` journals that *create* clearing balances. Those are AR/POS domain documents; Deposit Worksheets later settle them.

**Proof:** Gate A touchpoint registry + runtime assert in `TreasuryService.post`.

---

## TD-INV-3 — Immutability after post

```
∀ TreasuryDocument WHERE status = POSTED:
  UPDATE of amounts, accounts, lines, type, dates → REJECT
  Correction path = TREASURY_REVERSAL referencing reversesDocumentId
```

Drafts may be edited freely. `PENDING_APPROVAL` may return to `DRAFT` on reject without mutating a posted journal.

**Proof:** Service tests + concurrency test (simultaneous edit vs post).

---

## TD-INV-4 — Settlement ceiling

```
∀ settlement application of source receipt/payment S:
  Σ(settled amounts including this document) ≤ S.originatingAmount
```

Applies to Deposit Worksheet lines, partial deposits, and remittance amounts vs payable balances.

**Proof:** Unit tests + Gate C edge cases (partial, over-apply, concurrent double-settle).

---

## TD-INV-5 — Deposit Worksheet consumes only unsettled receipts

```
∀ DEPOSIT_WORKSHEET line referencing receipt R:
  R.settlementStatus ∈ { UNSETTLED, PARTIALLY_SETTLED }
  AND residual ≥ line.amount
  AND R not already fully consumed by another POSTED worksheet
```

Cannot deposit voided, reversed, or fully settled receipts.

**Proof:** Gate C operational scenarios + SQL residual queries.

---

## TD-INV-6 — Transfer accounts are liquidity-tagged

```
∀ TREASURY_TRANSFER (and CASH_WITHDRAWAL / CASH_DEPOSIT):
  every posting account has systemAccountTag ∈ LIQUIDITY_TAGS

LIQUIDITY_TAGS ⊇ {
  CASH, PETTY_CASH, UNDEPOSITED_FUNDS,
  BANK, CARD_CLEARING, MOBILE_MONEY
  …tenant extensions approved in chart setup
}
```

Expense, AR, AP, inventory, equity accounts are forbidden on pure transfers. (Petty cash *expense* documents may credit 1012 and debit an expense account — that is `PETTY_CASH` type, not `TREASURY_TRANSFER`.)

**Proof:** Governance unit tests + Gate A fitness (no MANUAL_JOURNAL transfer paths).

---

## TD-INV-7 — Full auditability

```
∀ TreasuryDocument:
  createdBy, createdAt required
  IF ever PENDING_APPROVAL or requiresApproval: approvedBy, approvedAt required before POSTED
  IF status = POSTED: postedAt, journalEntryId required
  audit_events append-only for create/submit/approve/reject/post/reverse
```

**Proof:** Gate E audit pack + SQL null checks.

---

## TD-INV-8 — No orphan liquidity journals

```
∀ journal entry J that posts to a liquidity-tagged account:
  J.treasuryDocumentId IS NOT NULL
  OR J is on the TD-INV-8 allow-list
```

### TD-INV-8 allow-list (explicit)

| Exception | Source | Rationale |
|-----------|--------|-----------|
| Receipt into clearing | `PAYMENT_RECEIPT` | Creates undeposited/card/MoMo clearing; settled later by TD |
| Sale refund cash-out | `SALES_REFUND` | Sales domain reversal of tender |
| Supplier / expense payment cash-out | `SUPPLIER_PAYMENT`, `EXPENSE_PAYMENT` | AP/expense domain documents (not treasury SSOT) |
| Legacy pre-cutoff journals | `legacyLiquidityJournal = true` AND `postedAt < cutoff` | Migration grandfather |
| Approved system correction | `SYSTEM_CORRECTION` + approved idempotency key | Break-glass only |

**Not allow-listed:** `MANUAL_JOURNAL` touching liquidity; ad-hoc register GL; bank deposit without TD after Phase 1B exit.

**Proof:** Gate B SQL orphan scan + Gate A fitness blocking new non-allow-listed writers.

---

## Account semantic invariants (Phase 1D)

| Account | Meaning (exclusive) |
|---------|---------------------|
| 1010 | Cash Drawer / till |
| 1012 | Petty Cash float |
| 1015 | Unsettled receipt clearing **only** |
| 1020 | Card clearing |
| 1030 | Bank |
| 1040 | Mobile money |

Any posting that uses 1015 for petty cash, float, or transfer **fails** certification after 1D migration.

---

## Relationship to posting governance

Treasury invariants **complement** Rules A–E in `postingGovernanceService`:

- Governance answers: *May this source post this shape to this account?*
- Treasury invariants answer: *Does a Treasury Document authorize and audit this liquidity movement?*

Both must pass before a post commits.
