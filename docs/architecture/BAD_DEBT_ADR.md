# ADR-006 — Bad Debt (AR Write-off) Domain Foundation

**Status:** Accepted / **Certified** — Phase 4 (4A–4E) complete  
**Date:** 2026-07-14  
**Program priority:** #4 after Treasury (ADR-003), Loss/Quarantine (ADR-004), VAT Remittance (ADR-005) — all CERTIFIED  
**Related:** [VAT_REMITTANCE_ADR.md](./VAT_REMITTANCE_ADR.md), [LOSS_QUARANTINE_ADR.md](./LOSS_QUARANTINE_ADR.md), [postingGovernanceService.ts](../../SamplePOS.Server/src/services/postingGovernanceService.ts), [docs/POSTING_INTEGRITY_AR_SPEC.md](../POSTING_INTEGRITY_AR_SPEC.md)  
**Invariants:** [BAD_DEBT_INVARIANTS.md](./BAD_DEBT_INVARIANTS.md)  
**Roadmap:** [BAD_DEBT_PHASE4_ROADMAP.md](./BAD_DEBT_PHASE4_ROADMAP.md)  
**Proof charter:** [PROOF_BAD_DEBT_CHARTER.md](../../PROOF_BAD_DEBT_CHARTER.md)  
**Certification run:** [PROOF_BAD_DEBT_RUN.md](../../PROOF_BAD_DEBT_RUN.md)

**Accepted:** 2026-07-14 — Phase 4A open.  
**Certified:** 2026-07-14 — Gates A–E PASS (`npm run proof:bad-debt-certification`); open waivers BD-D-W01, BD-D-W02.

---

## 0. Objective (freeze statement)

**Freeze AR uncollectible recognition around one governed document: the Bad Debt Write-off.**

Uncollectible customer balances must clear **Accounts Receivable (1200)** against a dedicated **Bad Debt Expense** account via an auditable document — never via MANUAL_JOURNAL, never via sales credit notes (4010), and never via inventory disposal paths (5110/5120/5130).

Define:

- One canonical business object (`ArWriteoffDocument` / Bad Debt Write-off)
- One write gateway (`BadDebtService` or equivalent)
- One posting engine (document → balanced journal via governed `PostingSource`, e.g. `AR_WRITEOFF`)
- One open-item + customer-balance coupling contract
- Explicit boundaries vs CN/DN, deposits, payments, inventory loss, GL recon tips

Complete this ADR, the invariants, Phase 4 roadmap, and proof charter **before** implementing write-off UI or new AR cashless clears. **No new feature may invent a parallel AR write-off journal path or reuse credit-note contra-revenue for uncollectible receivables.**

---

## 1. Context

| Today | Problem |
|-------|---------|
| Customer credit note | DR **4010** / CR **1200** — correct for returns/price; **wrong P&L** for bad debt (understates revenue) |
| `AllowManualPosting = false` on 1200 | Blocks rogue MANUAL_JOURNAL — good; forces a governed source |
| No Bad Debt Expense / ADA accounts | No CoA home for uncollectible expense |
| `adjustCustomerBalance` | Can change subledger **without** GL — dangerous false clear |
| Inventory `WRITE_OFF` / Loss Disposal | Clears **1300**, not AR — different domain (ADR-004) |
| GL recon `writeOffAmount` | Matching residual tip (`SYSTEM_CORRECTION`) — not customer uncollectible |
| Dunning fees | **Increase** AR (DR 1200) — opposite direction |
| Program docs | Phase 4 named everywhere; no ADR/module yet |

Enterprise pattern (SAP FI write-off, Dynamics write-off journals, QuickBooks bad debt):

> **Recognize expense. Clear the receivable. Keep the invoice trail. Do not hide it in sales returns.**

This ADR adopts **direct write-off** for Phase 4 (document-gated). Allowance for doubtful accounts (ADA) is an optional later enhancement — neither ADA nor a provision engine exists today.

---

## 2. Decision summary

| Question | Decision |
|----------|----------|
| **Canonical object** | **`ArWriteoffDocument`** (header + invoice allocation lines) |
| **Method** | **Direct write-off** in Phase 4 — DR Bad Debt Expense / CR 1200 |
| **Expense account** | New CoA **`5210` Bad Debt Expense** (seeded; configurable via system account map) |
| **ADA / allowance method** | **Out of Phase 4 coding scope** — reserved ADR follow-on |
| **Write gateway** | `modules/bad-debt/` service that posts only through AccountingCore + open-item sync |
| **Posting source** | `AR_WRITEOFF` (Rule A/C allow-list on 1200 + expense) |
| **Open items** | Same TX: allocate to invoice(s), reduce outstanding, `syncCustomerBalanceFromInvoices` |
| **VAT on write-off** | **Policy Decision A (default):** write off tax-inclusive AR balance with DR expense = full open amount (simple retail POS). Optional later: split output VAT reclaim — explicit waive if deferred |
| **Credit notes** | Remain for commercial corrections only (4010); fitness rejects “write-off” memos on CN path |
| **Inventory loss** | ADR-004 only — never clear 1200 from `LOSS_DISPOSAL` |

### 2.1 Rejected alternatives

❌ *"Use a credit note labeled Bad Debt."*  
Misstates P&L (contra-revenue vs expense) and breaks VR/tax report semantics.

❌ *"MANUAL_JOURNAL CR 1200 / DR 6900."*  
Blocked by governance; weak audit; no open-item coupling.

❌ *"adjustCustomerBalance only."*  
Creates AR integrity lane drift (GL vs open-item).

❌ *"Allowance method in the same phase as the first write-off UI."*  
Requires new contra-asset, aging provision, and dual documents before any operator path exists. Defer.

❌ *"Reuse inventory WRITE_OFF reason or 5110."*  
Different economic event (stock vs receivable).

---

## 3. Business object model

```
ArWriteoffDocument                         ← CANONICAL BUSINESS OBJECT
  ├── documentNumber (BD-… / WO-…)
  ├── status: DRAFT → PENDING_APPROVAL → POSTED → (void via reversal)
  ├── customerId (required)
  ├── writeoffDate / postingDate
  ├── totalAmount
  ├── expenseAccountCode (default 5210)
  ├── reasonCode (UNCOLLECTIBLE | DISPUTE_LOST | BANKRUPTCY | OTHER)
  ├── memo, approvedBy, postedAt, journalEntryId
  │
  ├── ArWriteoffLine[]
  │     ├── invoiceId / invoiceNumber
  │     ├── openAmountBefore
  │     ├── writeoffAmount  (≤ open residual)
  │     └── memo
  │
  └── AuditEvent[]
```

### 3.1 What a Bad Debt Write-off is not

- Not a customer credit note (commercial return / price)
- Not a payment or deposit application
- Not an inventory disposal
- Not a GL reconciliation matching tip
- Not a treasury remittance

### 3.2 Document types (Phase 4)

| Type | Phase | Posts? |
|------|-------|--------|
| `AR_WRITEOFF` | 4B | Yes — DR 5210 / CR 1200 |
| `AR_WRITEOFF_REVERSAL` | 4B | Yes — reverse posted write-off |

---

## 4. Lifecycle

```
DRAFT
  │  submit (optional approval)
  ▼
PENDING_APPROVAL  ──reject──► DRAFT
  │  approve
  ▼
POSTED  ──create AR_WRITEOFF_REVERSAL──► original immutable; residual restored
```

Approval: amount / age threshold configurable; reversals always elevated permission.

---

## 5. Domain interactions

```
Open customer invoice (AR 1200)
        │
        │  AR_WRITEOFF document (allocations)
        ▼
BadDebtService ──post──► Journal (AR_WRITEOFF)
        │
        ├──► DR 5210 Bad Debt Expense
        ├──► CR 1200 AR (entity=customer)
        └──► Open-item residual ↓; customer balance sync
```

| Domain | Interaction |
|--------|-------------|
| **AR / Invoices** | Write-off consumes open residual; invoice status → Paid/WrittenOff per residual rules |
| **CN/DN** | Unrelated; still commercial |
| **Payments** | Partial pay then residual write-off allowed (TD-INV-4 style ceiling on residual) |
| **Deposits** | Apply deposits first when policy requires; write-off only remaining AR |
| **Tax / VAT** | Default Decision A (full open incl. VAT); document any reclaim split later |
| **Loss / Quarantine** | No shared documents or accounts |
| **Treasury** | No liquidity movement — expense-only (cash already not collected) |
| **Recon** | New AR aging / write-off lane optional in 4D; integrity lane must stay honest |

---

## 6. Target chart additions

| Code | Name | Role |
|------|------|------|
| **5210** | Bad Debt Expense | P&L — uncollectible receivables (Phase 4 seed) |
| **1200** | Accounts Receivable | Existing — credit on write-off |
| *(later)* **1210** | Allowance for Doubtful Accounts | Contra-AR — **not** Phase 4 |

---

## 7. Posting governance

- Add `AR_WRITEOFF` (and `AR_WRITEOFF_REVERSAL`) to allowed sources for **1200** credits and **5210** debits
- Keep `MANUAL_JOURNAL` blocked for 1200
- Customer `entityType` / `entityId` required on AR lines
- Shape: exactly one balanced journal per posted document; lines only 5210↔1200 (±tax split if Decision B later)

---

## 8. Backward compatibility

| Constraint | Approach |
|------------|----------|
| Existing CN / payment / void paths | Unchanged |
| Historical AR cleared via ad-hoc tools | Grandfather; Gate A orphan scan post-cutoff |
| Feature flag | `bad_debt_writeoff_enabled` default **false** |
| Reports | P&L picks up 5210; aging excludes written-off open items |

---

## 9. Permissions (RBAC)

| Permission | Use |
|------------|-----|
| `ar.writeoff.create` | Draft create/edit |
| `ar.writeoff.post` | Post below threshold |
| `ar.writeoff.approve` | Approve / post above threshold; approve reversals |
| `ar.writeoff.view` | Read + audit |

Temporary map to `accounting.manage` / `accounting.read` allowed in 4A–4B with Gate E plan to introduce dedicated keys.

---

## 10. Consequences

### Positive

- Honest P&L for uncollectibles
- AR integrity lane stays coupled (GL = open items)
- Clear boundary vs CN and inventory loss
- Fits existing document → journal pattern (Treasury / Loss / VAT)

### Trade-offs

- No IFRS expected-credit-loss provisioning until a later ADA ADR
- Operators must not use CN for collections failures (training + fitness)

### Follow-on

- Phase 5: Cross-domain reporting / governance certification
- Optional: ADA / allowance method ADR
- Optional: VAT output reclaim on write-off (Decision B)

---

## 11. Acceptance

This ADR is **Accepted** when:

1. Finance / product signs the freeze (§0)
2. [BAD_DEBT_INVARIANTS.md](./BAD_DEBT_INVARIANTS.md) approved
3. [BAD_DEBT_PHASE4_ROADMAP.md](./BAD_DEBT_PHASE4_ROADMAP.md) approved
4. [PROOF_BAD_DEBT_CHARTER.md](../../PROOF_BAD_DEBT_CHARTER.md) approved

**No Phase 4 implementation PRs merge until status flips to Accepted.**
