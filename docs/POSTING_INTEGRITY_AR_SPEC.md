# Posting Integrity Specification

**Status:** Draft — architecture repair (not remediation)  
**Scope:** Enterprise journal governance framework; **AR (1200) is the first enforced domain**  
**Tenant evidence:** Henber Pharmacy (`pos_tenant_henber_pharmacy`)  
**Date:** 2026-07-05 (rev 2 — unified governance framework)

---

## 1. Problem statement

Forensic decomposition established:

| Layer | Henber state | Conclusion |
|-------|--------------|------------|
| Open-item subledger | 22,481,614 | Source of truth for AR documents |
| Customer cache | 22,481,614 | Healthy — **no cache heal needed** |
| GL 1200 total (net-active) | 22,481,614 | Control account balances |
| **integrityGlDrift** | **0** | Not a control-account balancing failure |
| GL customer-scoped | 19,976,495 | **Posting attribution failure** |
| NON_CUSTOMER_AR | +2,505,119 | Masks scoped drift at total level |

**Diagnosis:** Posting integrity defect — not data integrity. GL and subledger often agree at the control account, but customer attribution and asymmetric workflows break per-customer reconciliation and drive recurring heal cycles.

**Strategic shift:** Repair symptoms → **prevent new defects** via a single governance pipeline and provable workflow contracts.

---

## 2. Accounting Journal Governance Framework

Governance must not live only in `arJournalGovernance.ts`. Introduce a **generic framework** with domain modules as consumers.

### 2.1 Target architecture

```
Journal request
      │
      ▼
AccountingCore.createJournalEntry()
      │
      ├── PostingGovernanceService.validate()     ← account master, source, normal balance
      │
      ▼
accountingJournalGovernance.validateJournal()     ← SINGLE ORCHESTRATOR
      │
      ├── arJournalGovernance.validate()
      ├── apJournalGovernance.validate()          ← exists today (inline import)
      ├── inventoryJournalGovernance.validate()     ← 1300 coupling, INVENTORY_MOVE source
      ├── cashJournalGovernance.validate()          ← 1010/1015 clearing rules
      ├── bankJournalGovernance.validate()          ← bank vs undeposited funds
      └── (future modules)
      │
      ▼
Persist ledger_transactions + ledger_entries
```

### 2.2 Module layout

```
SamplePOS.Server/src/modules/accounting-governance/
├── accountingJournalGovernance.ts    # orchestrator + shared types
├── arJournalGovernance.ts            # 1200 + open-item coupling rules
├── apJournalGovernance.ts            # migrate from supplier-payments/
├── inventoryJournalGovernance.ts
├── cashJournalGovernance.ts
├── bankJournalGovernance.ts
├── types.ts                          # GovernanceJournalContext, GovernanceJournalLine
└── accountingJournalGovernance.test.ts
```

### 2.3 Orchestrator contract

```typescript
export interface GovernanceJournalContext {
  referenceType?: string;
  referenceId?: string;
  source: PostingSource;
  idempotencyKey?: string;
  lines: GovernanceJournalLine[];
}

export function validateJournal(ctx: GovernanceJournalContext): void {
  validateArJournalPosting(ctx);        // no-op if no 1200 lines
  validateApJournalPosting(ctx);        // existing rules
  validateInventoryJournalPosting(ctx);
  validateCashJournalPosting(ctx);
  validateBankJournalPosting(ctx);
}
```

**Integration point:** Replace the ad-hoc `validateApJournalPosting` import in `accountingCore.ts` with one call to `validateJournal()`.

### 2.4 Fail-fast policy

Invalid journals must **never** partially persist. Reject at governance with a typed business rule:

```typescript
throw new PostingGovernanceError(
  'AR journal missing customer attribution.',
  'GOV_RULE_AR_ENTITY_REQUIRED',
  { accountCode: '1200', referenceType, source },
);
```

`PostingGovernanceError` extends `BusinessRuleException` → HTTP **422** (not 500). Callers must not catch-and-continue.

**Principle:** Failing fast at post time is preferable to inserting data that later requires reconciliation scripts.

---

## 3. AR posting invariants (complete set)

### AR-INV-1 — Customer attribution

Every posting to AR account **1200** must have:

- `entityType = customer` (normalized lowercase at write boundary)
- `entityId != NULL` (valid `customers.id` UUID)

**Unless** posting `source` is an explicit exception:

| Exception source | Requires |
|------------------|----------|
| `CUTOVER_OB` | Finance approval + audit event |
| `OPENING_BALANCE_WIZARD` | One-time wizard lock |
| `SYSTEM_CORRECTION` | Approved idempotency key pattern + finance sign-off |

All other sources — including `SALES_INVOICE`, `SALES_REFUND`, `PAYMENT_RECEIPT`, `MANUAL_JOURNAL` — **require** attribution when touching 1200.

### AR-INV-2 — Debit ↔ open-item coupling (1:1)

Every AR GL **debit** on 1200 must have **exactly one** corresponding open-item creation or increase in the **same SQL transaction**:

```
GL DR 1200  ──1:1──►  invoice.amount_due ↑  OR  OPENING_BALANCE invoice created
```

Counterexamples (violations):

- GL debited; no invoice row
- GL debited; invoice in separate uncommitted path
- Double GL debit for single invoice (duplicate journal)

### AR-INV-3 — Credit ↔ open-item coupling (never GL-only)

Every AR GL **credit** that clears receivable must reduce **one or more** open items (invoice `amount_due`, allocation, or payment unallocated balance) in the **same transaction**.

```
GL CR 1200  ──►  invoice.amount_due ↓  OR  ar_payment allocation  (never GL-only)
```

Counterexample: TXN-015298 — refund credited 1200 while invoice `amount_due = 0`.

### AR-INV-4 — Refund symmetry

No refund may reduce AR (credit 1200) **unless** invoice allocation / `amount_due` changes in the **same transaction**.

If open-item cannot move (already zero, wrong payment method branch), GL must not credit 1200 — throw `BusinessRuleException` instead.

### AR-INV-5 — Invoice atomic commit

No invoice may commit unless **all** of the following commit together inside **one SQL transaction**:

| Artifact | Examples |
|----------|----------|
| Invoice document | `invoices` row |
| Journal | `ledger_transactions` + `ledger_entries` |
| Open item | `amount_due` / status |
| Customer balance | `customers.balance` via sync |
| Audit event | `audit_logs` where applicable |

### AR-INV-6 — No AccountingCore bypass

No posting path may write to `ledger_entries` / `ledger_transactions` except through `AccountingCore.createJournalEntry()` or `AccountingCore.reverseTransaction()`.

**Application layer audit (2026-07-05):** Only `accountingCore.ts` performs `INSERT INTO ledger_*` in TypeScript. ✅

**Residual risks to inventory in Phase 1A:**

| Risk | Location | Action |
|------|----------|--------|
| Legacy SQL triggers | `shared/sql/*_gl_trigger*.sql`, `account_balance_sync_triggers.sql` | Verify disabled/dropped in production |
| Heal/repair scripts | `henber-*-repair.mjs`, `glRepairService.ts`, `remediation-accounting-2026-04.ts` | Freeze → retire |
| Repost without TX | `glValidationService` calling `recordSaleToGL` without `txClient` | Fix or gate behind governance exception |

---

## 4. Phase 1A — Posting path inventory (before enforcement)

**Do not enable AR governance until this phase completes.** Otherwise legacy paths break unexpectedly in production.

### 4.1 AR-touching application paths

| # | Workflow | Orchestrator | GL function | Uses `txClient`? | Open-item sync | Entity on 1200 | Governance risk |
|---|----------|--------------|-------------|------------------|----------------|----------------|-----------------|
| 1 | Credit sale (POS) | `salesService.createSale` | `recordSaleToGL` | ✅ | `syncCustomerBalanceFromInvoices` | ⚠️ if `customerId` | Medium |
| 2 | Deposit sale | `salesService` | `recordSaleToGL` + `recordDepositApplicationToGL` | ✅ | deposit path | ❌ sale AR untagged | High |
| 3 | Wholesale invoice | `distService` | `recordCustomerInvoiceToGL` | ✅ | invoice row | ✅ | Low |
| 4 | DN invoice | delivery flow | `recordDeliveryNoteInvoiceToGL` | ✅ | invoice | ✅ | Low |
| 5 | Payment (AR SSOT) | `arPaymentService` | `recordCustomerPaymentToGL` | ✅ | allocation engine | ✅ | Low |
| 6 | Payment (legacy clearing) | `clearingService` | `recordInvoicePaymentToGL` | ✅ | `recalcInvoiceBalance` | ❌ | **High — migrate** |
| 7 | Down-payment clearing | `clearingService` | `recordDownPaymentClearingToGL` | ✅ | yes | ✅ | Low |
| 8 | Sale refund | `salesService.refundSale` | `recordSaleRefundToGL` | ✅ | ⚠️ CREDIT only | ❌ | **Critical** |
| 9 | Sale void | `salesService.voidSale` | `recordSaleVoidToGL` | ✅ | yes | mirror | Medium |
| 10 | Credit note | `creditDebitNoteService.postNote` | `recordCustomerCreditNoteToGL` | ✅ | `recalcInvoice` | ✅ | Low |
| 11 | Debit note | `creditDebitNoteService.postNote` | `recordCustomerDebitNoteToGL` | ✅ | `recalcInvoice` | ✅ | Low |
| 12 | CN/DN cancel | `creditDebitNoteService.cancelNote` | `reverseTransaction` | ⚠️ pool leak | `recalcInvoice` | mirror | Medium |
| 13 | Customer OB | `customerService.importCustomerOpeningBalance` | direct `createJournalEntry` | ✅ | OB invoice | ✅ | Low |
| 14 | OB cancel | `customerService.cancelCustomerOpeningBalance` | `reverseTransaction` | ✅ | yes | ✅ | Low |
| 15 | Dunning | `dunningService` | direct `createJournalEntry` | ✅ | none | ✅ | Document exception |
| 16 | Manual journal | `journalEntryService` | `createJournalEntry` | ✅ | none | optional | Manual review |
| 17 | GL repair | `glRepairService` | `recordSaleToGL` / `createJournalEntry` | ❌ | none | ❌ | **Freeze** |
| 18 | Bank recon write-off | `glReconciliationService` | `createJournalEntry` | own TX | none | ❌ | Review |

### 4.2 All `createJournalEntry` call sites (AccountingCore SSOT)

**Primary facade:** `glEntryService.ts` (~25 journal types) — preferred path for domain posting.

**Direct callers (must remain governance-visible):**

| Module | AR relevance |
|--------|--------------|
| `customers/customerService.ts` | Opening balance |
| `credit-debit-notes/creditDebitNoteService.ts` | CN return inventory + notes |
| `dunning/dunningService.ts` | Dunning AR debit |
| `distribution/distService.ts` | Wholesale |
| `bankingService.ts` | Bank/cash (indirect AR) |
| `cash-register/cashRegisterService.ts` | Cash clearing |
| `journalEntryService.ts` | Manual journals |
| `glRepairService.ts` | **Repair — freeze** |
| `glReconciliationService.ts` | Write-offs |
| `asset-accounting/*` | Non-AR |
| `supplier-payments/*` | AP |
| `scripts/remediation-*`, `henber-*-repair.mjs` | **Retire** |

### 4.3 Phase 1A deliverables

- [ ] `docs/POSTING_PATH_INVENTORY.md` — machine-generated call-site list (script: `audit-posting-paths.mjs`)
- [ ] Production DB query: confirm no active `BEFORE INSERT ON sales` GL triggers
- [ ] Freeze list signed by engineering + finance: repair scripts, phase-3 remediate, drift heal
- [ ] Gap tickets for every ❌ / **High** row in §4.1 before Phase 1B

**Exit criteria:** Zero unaccounted ledger write paths; freeze list enforced in CI.

---

## 5. Phase 1B — Enable governance (after 1A)

1. Create `accounting-governance/` module tree (§2.2)
2. Migrate `apJournalGovernance.ts` into module; preserve existing rule codes
3. Implement `arJournalGovernance.ts`:
   - AR-INV-1 enforcement (entity required on 1200)
   - Block `AR-DRIFT-HEAL-*` idempotency keys
   - Block untagged `SYSTEM_CORRECTION` on 1200
4. Wire `accountingJournalGovernance.validateJournal()` in `accountingCore.ts`
5. Stub `inventoryJournalGovernance`, `cashJournalGovernance`, `bankJournalGovernance` (no-op initially; AR first)

**Exit criteria:** Unit tests prove untagged 1200 throws `PostingGovernanceError`. Production flag: `AR_GOVERNANCE_ENFORCE=false` until Phase 2 path fixes land (optional feature flag for staged rollout).

---

## 6. Phase 2 — Fix posting paths

**Strict exit criterion:** Every workflow that can touch AR account 1200 must satisfy AR-INV-1 through AR-INV-6 before `AR_GOVERNANCE_MODE=enforce` (or `AR_GOVERNANCE_ENFORCE=true`).

### 6.1 Priority 1 (must fix before enforcement)

| Workflow | Required fix |
|----------|--------------|
| `recordSaleRefundToGL()` | Entity attribution; `arCreditAmount` capped to open-item reduction; AR/cash split |
| `recordInvoicePaymentToGL()` (legacy) | Entity attribution on 1200 + UF lines; `customerId` required |
| Deposit sale AR (`recordSaleToGL` DEPOSIT) | Tagged AR debit; `customerId` required |
| Refund on zero-balance invoice | No AR credit when `arCreditAmount = 0` (RC-B) |
| Credit sale unpaid AR | `requireCustomerIdForAr` — throw if missing |

### 6.2 Priority 2

Audit every caller of `AccountingCore.createJournalEntry()`, `recordSaleRefundToGL()`, `recordInvoicePaymentToGL()`, `recordCustomerPaymentToGL()` — none may bypass governance assumptions.

### 6.3 Per-fix checklist

| Requirement | Must pass |
|-------------|-----------|
| GL line `entityType='customer'` | ✅ |
| `entityId` present | ✅ |
| Open item updated in same transaction | ✅ |
| Customer balance updated | ✅ |
| Audit event written | ✅ |
| Same `txClient` propagated | ✅ |
| Automated test added | ✅ |

### 6.4 Shadow mode (deploy before hard enforcement)

| `AR_GOVERNANCE_MODE` | Behavior |
|----------------------|----------|
| `off` (default) | Entity attribution not checked |
| `warn` | Validate + log `GOV_RULE_I_AR_*` violations; allow posting |
| `enforce` | Reject violations with `PostingGovernanceError` |

Legacy: `AR_GOVERNANCE_ENFORCE=true` implies `enforce`.

**Rollout:** Run `warn` in production until logs are clean, then switch to `enforce`.

### 6.5 Regression tests (`postingIntegrity.ar.test.ts`)

Dedicated cases: credit sale, invoice payment (legacy + SSOT), refund, refund fully paid, refund zero-balance, deposit sale, credit note, debit note, opening balance.

Each asserts: journal entity tags, journal balance (DR=CR), and refund AR/cash split.

### 6.6 Final acceptance criteria (do not enable enforce until all true)

- ✅ All AR posting paths produce customer-attributed GL entries
- ✅ Refunds cannot move GL AR independently of open items
- ✅ Legacy payment path fixed (entity tags + `customerId`)
- ✅ Deposit sales comply with AR invariants
- ✅ All AR governance tests pass (`npm run test:accounting-governance`)
- ✅ `postingIntegrity.ar.test.ts` passes (`npm run test:posting-integrity`)
- ✅ Existing accounting regression suite passes
- ✅ No governance warnings when running `AR_GOVERNANCE_MODE=warn` in production — **Phase 2.5**
- ✅ Historical untagged entries scheduled for Phase 4 backfill only — not generated by current code

**Next step:** Deploy with `AR_GOVERNANCE_MODE=warn` and complete [Phase 2.5 warn validation](./PHASE_2_5_WARN_VALIDATION.md) before `enforce`.

| Priority | Change | Invariant |
|----------|--------|-----------|
| P0 | `recordSaleRefundToGL` — entity tags + `arCreditAmount` | AR-INV-1, 3, 4 |
| P0 | `recordInvoicePaymentToGL` — entity tags; `customerId` required | AR-INV-1, 3 |
| P0 | `recordSaleToGL` DEPOSIT path — entity tags | AR-INV-1 |
| P0 | `salesService.refundSale` — compute `arCreditAmount` before GL | AR-INV-3, 4 |
| P0 | Credit sale — throw if `customerId` missing when posting AR debit | AR-INV-1, 2 |
| P1 | Deprecate legacy `recordInvoicePaymentToGL` | AR-INV-3 |
| P1 | `cancelNote` — use `client` not `pool` for GL lookup | AR-INV-5 |
| P1 | `glRepairService` — disable AR repost or require governance exception | AR-INV-6 |
| P2 | Normalize `entityType` at `AccountingCore` write boundary | AR-INV-1 |
| P2 | Dunning — document as AR-INV-2 exception or create dunning invoice | AR-INV-2 |

---

## 7. Phase 3 — Automated posting proofs

### 7.1 Proof matrix (required after each phase)

For **each workflow**, publish a proof row. All cells must be ✅ before phase sign-off.

| Workflow | Invoice | Open Item | GL | Entity | Customer Balance | Journal | Atomic Commit |
|----------|---------|-----------|-----|--------|------------------|---------|---------------|
| Credit sale | | | | | | | |
| Payment | | | | | | | |
| Refund | | | | | | | |
| Deposit | | | | | | | |
| Credit note | | | | | | | |
| Debit note | | | | | | | |
| Void | | | | | | | |
| Cancellation | | | | | | | |
| Write-off | | | | | | | |
| Opening balance | | | | | | | |
| Migration import | | | | | | | |
| Historical data | N/A | N/A | backfill | backfill | sync | migration | one-time TX |

**Legend:** ✅ proven by automated test · ⚠️ partial · ❌ gap · N/A not applicable

### 7.2 Current baseline (pre-Phase 2)

| Workflow | Inv | OI | GL | Ent | Bal | Jnl | Atomic |
|----------|-----|----|----|-----|-----|-----|--------|
| Credit sale | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Payment (SSOT) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payment (legacy) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Refund | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deposit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Credit note | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Debit note | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Void | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Cancellation | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Write-off | — | — | ⚠️ | ❌ | — | ⚠️ | ⚠️ |
| Opening balance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Migration import | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 7.3 Test artifacts

| Suite | Purpose | CI |
|-------|---------|-----|
| `accountingJournalGovernance.test.ts` | Framework + AR-INV-1 unit tests | ✅ `test:accounting-governance` |
| `arJournalGovernance.test.ts` | AR warn/enforce modes | ✅ `test:accounting-governance` |
| `postingIntegrity.ar.test.ts` | Per-workflow proof matrix (mocked `AccountingCore`) | ✅ `test:posting-integrity` |
| `glEntryService.accuracy.test.ts` | GL balance + entity assertions | ✅ `test:posting-integrity` |
| `accounting-integrity.test.ts` | DB regression suite | ✅ `test:accounting` |
| `proof-ar-drift-decompose.mjs` | Production read-only headline metrics | manual |

**CI gate (mandatory for `main`):** `accounting-integrity.yml` runs all three test commands above.

---

## 8. Phase 4 — Historical repair (one-time only)

**Never** create a recurring `heal_ar_metadata.sql` job or scheduled metadata heal.

### 8.1 Migration pattern

```
Migration 534__ar_metadata_backfill.sql  (or numbered next available)
        ↓
DRY_RUN proof script (read-only classification)
        ↓
Finance sign-off
        ↓
APPLY (single transaction batches per customer)
        ↓
proof-ar-drift-decompose → customerScopeDrift ≈ 0
        ↓
Archive evidence → delete repair tooling
```

### 8.2 Backfill scope

1. SALE → `sales.customer_id` where resolvable
2. INVOICE_PAYMENT → invoice → customer
3. SALE_REFUND → sale → customer
4. Manual queue for unresolvable rows

### 8.3 Tooling lifecycle

| Artifact | Fate |
|----------|------|
| `henber-ar-phase3-remediate.mjs` | Delete after Migration 534 verified |
| `henber-ar-phase3-reverse-txn.ts` | Archive in `release-evidence/` |
| Forensic scripts (`henber-ar-forensic-*.mjs`) | Keep read-only for audit |
| `glRepairService` AR repost | Remove or hard-gate |

**Prerequisite:** Phase 1B + Phase 2 deployed — no new untagged entries during backfill.

---

## 9. Phase 5 — Retire heal infrastructure

- Remove AR drift heal from GitHub Actions
- Governance blocks `AR-DRIFT-HEAL-*` and `AP-DRIFT-HEAL-*` keys
- Period-close gates: `integrityGlDrift`, `customerScopeDrift`, attribution coverage
- Document that reconciliation scripts are **incident-only**, not operational

---

## 10. Confirmed defect classes (Henber evidence)

### RC-A — Missing attribution (~3.1M untagged SALE GL)

Pre-2026-05-22 credit sales; still open: refund, legacy payment, deposit sale paths.

### RC-B — Refund asymmetry (TXN-015298, TXN-016012)

GL credits 1200 without open-item movement when `amount_due = 0`.

### RC-C — Dual payment rails

AR SSOT correct; legacy `recordInvoicePaymentToGL` untagged (−171,299).

### RC-D — Scoped drift (BOU, African Humanitarian)

Combination of RC-B + payment/recalc timing — fix via invariants, not customer tracing.

---

## 11. Roadmap summary

```
Phase 0   Freeze remediation / heal
    ↓
Phase 1A  Inventory ALL posting paths; prove no AccountingCore bypass
    ↓
Phase 1B  Deploy accountingJournalGovernance framework (AR first)
    ↓
Phase 2   Fix posting paths to satisfy AR-INV-1…6
    ↓
Phase 2.5 Production warn validation — operational evidence (see PHASE_2_5_WARN_VALIDATION.md)
    ↓
Phase 3   Automated proof matrix (§7) — CI required
    ↓
Phase 4   Migration 534 one-time backfill → archive → delete repair tools
    ↓
Phase 5   Retire heal infrastructure permanently
```

**Success definition:** New AR documents always produce fully attributed, atomic journals; `customerScopeDrift` stays at zero without manual intervention; governance framework extensible to AP/inventory/cash/bank.

---

## 12. Reference — code locations

| Concern | Path |
|---------|------|
| Journal SSOT | `SamplePOS.Server/src/services/accountingCore.ts` |
| Domain GL facade | `SamplePOS.Server/src/services/glEntryService.ts` |
| Account master governance | `SamplePOS.Server/src/services/postingGovernanceService.ts` |
| AP rules (migrate) | `SamplePOS.Server/src/modules/supplier-payments/apJournalGovernance.ts` |
| Sale orchestration | `SamplePOS.Server/src/modules/sales/salesService.ts` |
| AR payments SSOT | `SamplePOS.Server/src/modules/ar-payments/arPaymentService.ts` |
| Credit/debit notes | `SamplePOS.Server/src/modules/credit-debit-notes/creditDebitNoteService.ts` |
| Opening balance | `SamplePOS.Server/src/modules/customers/customerService.ts` |
| Reconciliation metrics | `SamplePOS.Server/src/modules/customer-payments/arReconciliationEngine.ts` |
| Production proof | `SamplePOS.Server/scripts/proof-ar-drift-decompose.mjs` |
