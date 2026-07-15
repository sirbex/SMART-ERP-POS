# ADR-003 — Treasury Document Domain Foundation

**Status:** Accepted — Phase 1 **CERTIFIED** (Gates A–E; see [PROOF_TREASURY_DOCUMENT_RUN.md](../../PROOF_TREASURY_DOCUMENT_RUN.md))  
**Date:** 2026-07-12  
**Phase 1 code:** `SamplePOS.Server/src/modules/treasury/`, `shared/sql/541`–`544`, `shared/treasury/`  
**Related:** [postingGovernanceService.ts](../../SamplePOS.Server/src/services/postingGovernanceService.ts), [FINANCIAL_GOVERNANCE.md](../FINANCIAL_GOVERNANCE.md), [FINANCIAL_RECONCILIATION_FRAMEWORK.md](../FINANCIAL_RECONCILIATION_FRAMEWORK.md)  
**Invariants:** [TREASURY_DOCUMENT_INVARIANTS.md](./TREASURY_DOCUMENT_INVARIANTS.md)  
**Roadmap:** [TREASURY_PHASE1_ROADMAP.md](./TREASURY_PHASE1_ROADMAP.md)  
**Proof charter:** [PROOF_TREASURY_DOCUMENT_CHARTER.md](../../PROOF_TREASURY_DOCUMENT_CHARTER.md)

---

## 0. Objective (freeze statement)

**Freeze the Treasury domain around one canonical business object: the Treasury Document.**

Treat Deposit Worksheets, Treasury Transfers, Petty Cash movements, cash withdrawals/deposits, card settlement, mobile-money settlement, and (later) VAT / WHT remittance as **document types** of one domain — not independent posting paths with divergent GL shapes.

Define:

- One canonical business object (`TreasuryDocument`)
- One write gateway (`TreasuryService`)
- One posting engine (document → balanced journal via governed `PostingSource`)
- One settlement / immutability contract

…used consistently across POS cash register, Banking, AR receipts clearing, AP/supplier cash outflows that are remittances, Customer Deposits (cash side), WHT remittance, and future VAT remittance.

Complete this ADR, the invariants, Phase 1 roadmap, and proof charter **before** implementing Deposit Worksheet, Petty Cash split, or new transfer UIs. **No new feature may invent a parallel liquidity journal path or bypass `TreasuryService`.**

---

## 1. Context

SamplePOS already has strong posting governance (Rules A–E), Undeposited Funds (1015), Cash (1010), Card (1020), Bank (1030), Mobile Money (1040), and cash-register movement dialogs. What it lacks is a **document-level SSOT** for liquidity movements:

| Today | Problem |
|-------|---------|
| Register `CASH_OUT_BANK` | Often operational only; GL path inconsistent with bank deposit |
| Bank deposit / `PAYMENT_DEPOSIT` | Clears 1015 → cash/bank, but no first-class deposit worksheet document |
| Manual / register transfers | Fragmented; risk of `MANUAL_JOURNAL` for cash (Rule D conflicts) |
| Petty cash expense | Co-mingled with drawer cash (1010) — 1015 / 1010 semantics blur |
| WHT remittance | Credits cash correctly, but not under a treasury document header |
| Future VAT remittance | Would likely invent yet another one-off posting path |

Enterprise ERP pattern (SAP FI cash journals / bank statements, Dynamics cash & bank management, QuickBooks Undeposited Funds + Deposit):

> **Receipts create clearing. Treasury documents settle and move liquidity.**

This ADR adopts that split.

---

## 2. Decision summary

| Question | Decision |
|----------|----------|
| **What is the canonical business object?** | **`TreasuryDocument`** — header + lines for every liquidity movement that posts (or will post) to liquidity-tagged accounts. |
| **What is the SSOT for liquidity journals?** | The Treasury Document. GL journals **reference** the document; they are not the business SSOT. |
| **Write gateway** | `TreasuryService` (server module; shared types/invariants under `shared/treasury` when implemented). |
| **Posting** | Exactly **one balanced journal** per posted Treasury Document (TD-INV-1). Corrections = reversal document + optional replacement. |
| **Receipts vs treasury** | AR/POS/customer-deposit **receipts** post via `PAYMENT_RECEIPT` into clearing (typically 1015 / card / MoMo). They are **not** Treasury Documents. Deposit Worksheets **consume** unsettled receipt lines. |
| **AP supplier payments / expense payments** | Remain domain documents (supplier payment, expense payment). They may **credit** liquidity accounts under existing governed sources. Remittances that are pure tax/authority settlements **migrate** onto Treasury Document types (WHT, VAT). |
| **Petty cash** | Dedicated account **1012 Petty Cash**, distinct from **1010 Cash Drawer**. |
| **Undeposited Funds (1015)** | Exactly one meaning: unsettled receipt clearing awaiting Deposit Worksheet. |
| **Governance** | New posting source(s) under the `TREASURY_*` family; Rule D extended so cash credits for treasury movements come from treasury sources — **not** `MANUAL_JOURNAL`. |

### 2.1 Rejected alternatives

❌ *"Keep fixing cash-register and banking paths independently."*  
Produces permanent dual SSOT and orphan clearing balances.

❌ *"Use MANUAL_JOURNAL for transfers and petty cash."*  
Conflicts with Rule D / `allowManualPosting` and weakens audit.

❌ *"Bank statement import is the SSOT."*  
Statements reconcile; they do not originate operational movements.

---

## 3. Business object model

### 3.1 Hierarchy

```
TreasuryDocument                          ← CANONICAL BUSINESS OBJECT
  ├── documentNumber (TD-…)
  ├── documentType
  │     DEPOSIT_WORKSHEET
  │     TREASURY_TRANSFER
  │     PETTY_CASH
  │     CASH_WITHDRAWAL
  │     CASH_DEPOSIT
  │     CARD_SETTLEMENT
  │     MOBILE_MONEY_SETTLEMENT
  │     VAT_REMITTANCE          (Phase 3 — reserved)
  │     WHT_REMITTANCE          (migrate existing remittance onto TD)
  │     TREASURY_REVERSAL
  ├── status: DRAFT → PENDING_APPROVAL → POSTED → (void via reversal)
  ├── currency, transactionDate, postingDate
  ├── fromAccountId / toAccountId (type-dependent)
  ├── bankAccountId / depositReference (deposit worksheet)
  ├── totalAmount, overageAmount, shortageAmount
  ├── createdBy, approvedBy, postedAt, journalEntryId
  │
  ├── TreasuryDocumentLine[]
  │     ├── lineType (RECEIPT_APPLICATION | ACCOUNT_MOVE | ADJUSTMENT | FEE | …)
  │     ├── sourceReceiptId / paymentId / sessionMovementId (nullable)
  │     ├── accountId, debit, credit, amount
  │     └── memo
  │
  └── AuditEvent[]                    ← creator, approver, timestamps, journal IDs
```

### 3.2 What a Treasury Document is not

- Not a customer invoice, supplier bill, or inventory adjustment
- Not a POS sale (sale posts revenue/COGS/AR; tender may feed clearing)
- Not a customer deposit **liability** document (customer deposits domain owns liability; cash side of later settlement may still clear via Deposit Worksheet)
- Not a bank statement line (reconciliation consumes posted treasury + statement)

### 3.3 Document types (Phase 1 ownership)

| Type | Phase | Responsibility |
|------|-------|----------------|
| `DEPOSIT_WORKSHEET` | 1B | Batch unsettled receipts → bank (clear 1015 / card / MoMo clearing) |
| `TREASURY_TRANSFER` | 1C | Cash ↔ Bank ↔ MoMo ↔ Card clearing; register transfers |
| `PETTY_CASH` | 1D | Fund / replenish / expense from 1012 |
| `CASH_WITHDRAWAL` / `CASH_DEPOSIT` | 1C | Explicit drawer ↔ bank (may be transfer subtypes) |
| `CARD_SETTLEMENT` / `MOBILE_MONEY_SETTLEMENT` | 1B/1C | Clearing → bank with fees/shortages |
| `WHT_REMITTANCE` / `VAT_REMITTANCE` | later | Authority settlement; same TD header + liquidity credit |

---

## 4. Lifecycle and state transitions

```
DRAFT
  │  submit (optional approval path)
  ▼
PENDING_APPROVAL  ──reject──► DRAFT
  │  approve
  ▼
POSTED  ──create TREASURY_REVERSAL──► original remains POSTED (immutable)
                                      reversal POSTED; net economic effect zero
```

| Transition | Rules |
|------------|-------|
| DRAFT → POSTED (or via approval) | Validate invariants; create balanced journal; set `journalEntryId`; freeze header/lines |
| POSTED | Immutable (TD-INV-3). No edit of amounts, accounts, or lines |
| Correction | New `TREASURY_REVERSAL` referencing `reversesDocumentId`, then optional new draft |
| Delete | Only DRAFT (hard delete or void-as-cancelled). Never delete POSTED |

Approval rules (configurable per tenant / amount threshold):

- Below threshold: DRAFT → POSTED directly (`treasury.post`)
- At/above threshold: DRAFT → PENDING_APPROVAL → POSTED (`treasury.approve`)
- Reversals always require `treasury.approve` (or equivalent)

---

## 5. Domain interactions

```
POS tender / AR receipt / Customer deposit cash-in
        │
        │  PAYMENT_RECEIPT (not a Treasury Document)
        ▼
  Clearing accounts (1015, 1020, 1040, …)
        │
        │  DEPOSIT_WORKSHEET / CARD_SETTLEMENT / MoMo SETTLEMENT
        ▼
TreasuryDocument ──post──► Journal (TREASURY_* source)
        │
        ├──► Bank (1030) / Cash Drawer (1010) / Petty Cash (1012)
        │
Banking reconciliation ◄── statement lines match posted TD journals
```

| Domain | Interaction |
|--------|-------------|
| **POS / Cash Register** | Session movements that move liquidity become TD lines or generate TD drafts; register UI stops inventing standalone GL for bank/petty paths |
| **AR** | Receipts remain AR documents; Deposit Worksheet consumes unsettled receipt settlement keys |
| **AP / Supplier payments** | Operating payments stay supplier-payment documents; authority remittances migrate to TD |
| **Banking** | Deposit references + bank account on TD; reconciliation matches `journalEntryId` / TD number |
| **Customer Deposits** | Liability accounting unchanged; physical cash still lands in clearing then Deposit Worksheet |
| **WHT** | Existing remittance API becomes a TD of type `WHT_REMITTANCE` (compat shim allowed in 1A) |
| **VAT (future)** | Same pattern as WHT: payable clear + liquidity credit under TD |
| **Posting governance** | Rule D / Rule E updated for `TREASURY_*` sources; MANUAL_JOURNAL never used for treasury |

---

## 6. Target liquidity chart of accounts

| Code | Name | Tag / role |
|------|------|------------|
| **1010** | Cash Drawer | `CASH` — till / register |
| **1012** | Petty Cash | `CASH` (or `PETTY_CASH`) — operating float, not till |
| **1015** | Undeposited Funds | `UNDEPOSITED_FUNDS` — **only** unsettled receipts |
| **1020** | Card Clearing | Card tender awaiting settlement |
| **1030** | Bank | Operating bank |
| **1040** | Mobile Money | MoMo wallet / clearing |

**Invariant for 1015:** one meaning only — receipt clearing awaiting Deposit Worksheet. Petty cash, float, and transfers must not use 1015.

---

## 7. Posting governance implications

Introduce posting sources (exact enum names finalized in 1A):

- `TREASURY_DEPOSIT` — Deposit Worksheet / card / MoMo settlement into bank
- `TREASURY_TRANSFER` — liquidity ↔ liquidity
- `TREASURY_PETTY_CASH` — petty cash fund/expense/replenish
- `TREASURY_REVERSAL` — reversing journals only

**Rule D (cash credit):** allow these treasury sources in addition to existing `PAYMENT_DEPOSIT`, `SUPPLIER_PAYMENT`, `WHT_REMITTANCE`, `SALES_REFUND`, `SYSTEM_CORRECTION`. Plan: fold legacy `PAYMENT_DEPOSIT` and `WHT_REMITTANCE` behind TD creators so callers never post those sources without a document id.

**TD-INV-8:** every journal that touches liquidity-tagged accounts must carry `treasuryDocumentId` (except explicitly grandfathered receipt-side `PAYMENT_RECEIPT` debits into clearing, and non-treasury credits already governed — see invariants doc for the precise allow-list).

---

## 8. Backward compatibility

| Constraint | Approach |
|------------|----------|
| Existing bank deposits / register movements | Compat adapters create TD rows retrospectively or on next post; dual-write during 1A–1C |
| Historical journals without TD | Migration tags `legacyLiquidityJournal = true`; Gate A tracks until backfill or accept-as-legacy cutoff date |
| Reports (cash, bank, undeposited) | Same account codes; semantics of 1015 tightened in 1D with mapping migration |
| WHT remittance API | Keep URL/contract; internally create TD |
| Customer-facing deposit APIs | Unchanged (customer deposit module) |

---

## 9. Permissions (RBAC)

| Permission | Use |
|------------|-----|
| `treasury.create` | Create/edit DRAFT |
| `treasury.post` | Post below approval threshold |
| `treasury.approve` | Approve / post above threshold; approve reversals |
| `treasury.reverse` | Create reversal documents |
| `treasury.view` | Read documents + audit |
| `treasury.manage_accounts` | Map liquidity accounts / petty cash setup |

Map to existing `accounting.*` roles during Phase 1; introduce dedicated keys before certification (Gate E).

---

## 10. Consequences

### Positive

- One audit trail for all liquidity movement
- 1015 stops accumulating orphan balances
- Rule D governance becomes coherent (no MANUAL_JOURNAL treasury hacks)
- VAT/WHT remittance fit the same model later without redesign

### Trade-offs

- Up-front documentation and migration cost before feature velocity
- Dual-write period until register/banking UIs fully migrate
- Receipt vs treasury boundary must be taught to operators

### Follow-on (out of Phase 1 coding scope until this ADR is Accepted)

- Phase 2: Loss & Quarantine GL integrity — [LOSS_QUARANTINE_ADR.md](./LOSS_QUARANTINE_ADR.md) (Accepted; Phase 2A open)
- Phase 3: VAT Remittance (TD type)  
- Phase 4: Bad Debt Workflow  
- Phase 5: Reporting, Proofs & Governance certification across domains  

---

## 11. Acceptance

This ADR is **Accepted** when:

1. Product / finance owner signs the freeze statement (§0)
2. [TREASURY_DOCUMENT_INVARIANTS.md](./TREASURY_DOCUMENT_INVARIANTS.md) approved
3. [TREASURY_PHASE1_ROADMAP.md](./TREASURY_PHASE1_ROADMAP.md) approved
4. [PROOF_TREASURY_DOCUMENT_CHARTER.md](../../PROOF_TREASURY_DOCUMENT_CHARTER.md) approved

**No Phase 1 implementation PRs merge until status flips to Accepted.**
