# Treasury Phase 1 — Implementation Roadmap

**Status:** Accepted (locked with ADR-003; Phase 1A–1E complete)  
**ADR:** [TREASURY_DOCUMENT_ADR.md](./TREASURY_DOCUMENT_ADR.md)  
**Invariants:** [TREASURY_DOCUMENT_INVARIANTS.md](./TREASURY_DOCUMENT_INVARIANTS.md)  
**Proof charter:** [PROOF_TREASURY_DOCUMENT_CHARTER.md](../../PROOF_TREASURY_DOCUMENT_CHARTER.md)

**Program context:** Phase 1 is priority #1 in the financial risk order (Treasury → Loss/Quarantine → VAT → Bad Debt → Reporting). This roadmap covers **Phase 1 only**, decomposed into independently testable milestones **1A–1E**.

**Coding freeze:** Lifted for Phase 1 deliverables; new liquidity writers must go through `TreasuryService` / registry.

---

## Milestone map

| Milestone | Name | Primary exit |
|-----------|------|--------------|
| **1A** | Treasury Document Foundation | TD exists; posting requires TD; backward compatible |
| **1B** | Deposit Worksheet | 1015 clears; deposit register reconciles; no orphan clearing |
| **1C** | Treasury Transfer | One posting engine; no Rule D conflicts; no MANUAL_JOURNAL treasury |
| **1D** | Petty Cash Split | 1012 live; 1015 single meaning; reports consistent |
| **1E** | Certification | Proof suite green per charter Gates A–E |

Each milestone ships with: schema (if any) · service · API · tests · proof hooks · UI (if user-facing) · permissions · migration notes.

---

## Phase 1A — Treasury Document Foundation

### Scope

Create the canonical domain without yet replacing all UX flows.

**Responsible for (model ownership — not all UI in 1A):**  
Deposit Worksheets · Treasury Transfers · Petty Cash · Cash Withdrawals/Deposits · Card Settlement · Mobile Money Settlement · Future VAT Remittance · Future WHT Remittance.

### Deliverables

| Layer | Work |
|-------|------|
| **DB** | `treasury_documents`, `treasury_document_lines`, `treasury_document_audit`; `journal_entries.treasury_document_id` (nullable initially); indexes on status, type, dates, journal FK |
| **Shared** | Types, status enum, `treasuryInvariants` stubs mirroring TD-INV-* |
| **Service** | `TreasuryService`: createDraft, updateDraft, submit, approve, reject, post, reverse |
| **Posting** | `TREASURY_*` sources wired through `AccountingCore` + governance allow-lists (minimal transfer/deposit shapes) |
| **API** | CRUD/list for drafts; post/reverse endpoints behind feature flag `treasury.document.enabled` |
| **UI** | Minimal admin list/detail (read + draft) — full worksheets in 1B |
| **Permissions** | Map to `accounting.manage` initially; introduce `treasury.*` keys |
| **Migration** | Nullable FK; existing journals untouched; compat adapters stubbed |
| **Tests** | Unit: state machine, immutability, balanced post; governance: TREASURY_* vs Rule D |

### Backward compatibility

- Existing deposit / register / WHT paths continue to work unchanged
- Feature flag off = no behavior change
- When flag on for internal posts only: dual-write TD row for new `PAYMENT_DEPOSIT` / remittance (shim)

### Exit criteria

- [x] Treasury Document table + service exist
- [x] Posted TD always produces one balanced journal (TD-INV-1)
- [x] Posted TD immutable (TD-INV-3)
- [x] Audit fields populated (TD-INV-7)
- [x] Existing functionality remains backward compatible (flag-off regression suite green)

**Implemented:** 2026-07-12 — schema `541`, module `modules/treasury`, flag `treasury_document_enabled` (default false).

---

## Phase 1B — Deposit Worksheet

### Scope

QuickBooks-style clearing settlement.

### Capabilities

- Batch receipts
- Partial deposits
- Deposit references
- Bank selection
- Multiple receipts per worksheet
- Cash shortages / overages (explicit adjustment lines + accounts)
- Full audit trail

### Deliverables

| Layer | Work |
|-------|------|
| **DB** | Settlement residual columns / `receipt_settlement` link table; overage/shortage account mapping |
| **Service** | `createDepositWorksheet`, apply lines, validate TD-INV-4/5, post → Dr Bank / Cr 1015 (and card/MoMo variants) |
| **Governance** | `TREASURY_DEPOSIT` shape rules (successor to raw `PAYMENT_DEPOSIT`) |
| **API** | Worksheet CRUD; unsettled-receipts query; post |
| **UI** | Deposit Worksheet page (banking workspace): pick receipts, bank, reference, post |
| **Migration** | New deposits go through TD; legacy `PAYMENT_DEPOSIT` shim creates TD |
| **Compat** | Cash-register `CASH_OUT_BANK` either drafts a worksheet or is deprecated with warning |

### Exit criteria

- [x] 1015 clears correctly for worksheet posts
- [x] Deposit register balances reconcile to GL (`GET /treasury/deposit-reconciliation`)
- [x] No new orphan clearing balances under happy path + partial deposit (receipt_settlements residual)
- [x] TD-INV-4, TD-INV-5 enforced in service tests + proof Gate C (unit)

**Implemented:** 2026-07-12 — schema `542`, `depositWorksheetService`, `/accounting/deposit-worksheet`, Banking → Deposits tab.

---

## Phase 1C — Treasury Transfer

### Scope

Single document replacing fragmented liquidity moves:

- Manual cash transfers
- Register transfers
- Cash ↔ Bank · Bank ↔ Bank · MoMo ↔ Bank · Cash ↔ MoMo · Card ↔ Bank

### Deliverables

| Layer | Work |
|-------|------|
| **Service** | `TREASURY_TRANSFER` post path; liquidity-tag validation (TD-INV-6) |
| **Governance** | Rule D allows `TREASURY_TRANSFER`; reject MANUAL_JOURNAL cash moves |
| **API / UI** | Transfer form (from/to account, amount, memo, approval) |
| **Migration** | Register transfer endpoints call `TreasuryService` |
| **Fitness** | Gate A scan: no remaining MANUAL_JOURNAL writers for liquidity transfers |

### Exit criteria

- [x] Every in-scope liquidity movement uses the same posting engine
- [x] No Rule D governance conflicts in suite
- [x] No `MANUAL_JOURNAL` required (or permitted) for treasury movements

**Implemented:** 2026-07-12 — schema `543` liquidity tags; `treasuryTransferService`; register `CASH_OUT_BANK`/`CASH_IN_FLOAT` + bank transfers shim when flag on; `/accounting/treasury-transfer`.

---

## Phase 1D — Petty Cash Split

### Scope

Dedicated petty cash account and exclusive 1015 semantics.

### Chart (target)

| Code | Name |
|------|------|
| 1010 | Cash Drawer |
| 1012 | Petty Cash |
| 1015 | Undeposited Funds |
| 1020 | Card Clearing |
| 1030 | Bank |
| 1040 | Mobile Money |

### Deliverables

| Layer | Work |
|-------|------|
| **DB / SQL** | Ensure 1012 account + tags; seed mapping; deactivate wrong legacy mappings |
| **Service** | `PETTY_CASH` document: fund, replenish, expense |
| **Migration** | Reclass script (dry-run + live) for balances wrongly sitting in 1010/1015; proof artifact |
| **Reports** | Cash report split drawer vs petty; undeposited report = 1015 only |
| **UI** | Petty cash workspace; remove “petty expense” as undifferentiated drawer cash-out |

### Exit criteria

- [x] 1015 has exactly one meaning (unsettled receipts)
- [x] Legacy mappings migrated or documented with cutoff (`proof-petty-cash-reclass.mjs`)
- [x] Existing cash/bank reports remain consistent (parity proof — 1012 added to cash flow codes)

**Implemented:** 2026-07-12 — schema `544` seeds 1012; register float/expense use 1012; `/accounting/petty-cash`; reclass proof script.

---

## Phase 1E — Certification

### Scope

Run and publish the proof suite defined in the charter. **No new features** in 1E except proof harness fixes.

### Required evidence

| Area | Artifact |
|------|----------|
| Treasury invariants | TD-INV-1…8 automated checks |
| GL reconciliation | Liquidity accounts vs TD journals |
| Bank reconciliation | Sample statement match to TD deposits/transfers |
| Deposit reconciliation | Unsettled residual = 1015 (and card/MoMo clearing) |
| Performance | Batch deposit thresholds (charter Gate D) |
| Concurrency | Double-settle / simultaneous transfer races |
| Audit trail | Evidence pack sample |
| Permission model | RBAC matrix exercised |
| Migration validation | Dry-run + live reclass reports |

### Exit criteria

- [x] Gates A–E **PASS** (or accepted waivers documented)
- [x] `PROOF_TREASURY_DOCUMENT_*.md` run artifact published
- [x] ADR status → **Accepted / Certified** for Phase 1 scope

**Implemented:** 2026-07-12 — `npm run proof:treasury-foundation` / `proof:treasury-certification` / `ci:treasury-fitness`; artifact `PROOF_TREASURY_DOCUMENT_RUN.md`. Open waivers **D-W01** (staging latency) and **B-W02** (1015 residual drift) expire 2026-09-30 — clear before production flag-on.

---

## Cross-cutting specifications

### Database (summary)

- UUID PKs, tenant_id, soft status enums, `row_version` / `updated_at` for optimistic concurrency
- Partial unique indexes preventing double-settle of fully consumed receipts
- FK from journals → treasury_documents (nullable until backfill)

### APIs (summary)

```
POST   /api/treasury/documents
GET    /api/treasury/documents
GET    /api/treasury/documents/:id
PATCH  /api/treasury/documents/:id          # DRAFT only
POST   /api/treasury/documents/:id/submit
POST   /api/treasury/documents/:id/approve
POST   /api/treasury/documents/:id/reject
POST   /api/treasury/documents/:id/post
POST   /api/treasury/documents/:id/reverse
GET    /api/treasury/unsettled-receipts
```

Exact paths align with existing ERP route mounting in implementation.

### UI

- Banking / Treasury workspace hub
- Deposit Worksheet (1B)
- Transfer (1C)
- Petty Cash (1D)
- Document audit drawer (all)

### Permissions

Introduce `treasury.create|post|approve|reverse|view|manage_accounts` before Gate E; temporary mapping to `accounting.*` allowed in 1A–1C with explicit waiver.

### Migration strategy

1. **Expand** — schema + flag-off services  
2. **Dual-write** — shims create TD for legacy deposit/remittance  
3. **Cut over** — UI uses TD only  
4. **Constrain** — fitness functions block bypass writers  
5. **Backfill / grandfather** — pre-cutoff journals tagged for TD-INV-8  

### Backward compatibility gates (every milestone)

- Flag-off: zero behavior change
- Flag-on: legacy API contracts preserved via shims
- Report totals for 1010/1015/1030 within documented tolerance during reclass windows

---

## Explicit non-goals (Phase 1)

- VAT remittance UI/engine (Phase 3 — TD type reserved only)
- Bad debt / write-off workflow (Phase 4)
- Inventory loss & quarantine GL (Phase 2)
- Full bank statement AI matching
- Multi-currency treasury beyond existing FX posting rules

---

## Dependency order

```
ADR + Invariants + Roadmap + Charter Accepted
        │
        ▼
       1A Foundation ──► 1B Deposit Worksheet ──► 1C Transfer
                                │                     │
                                └────────► 1D Petty Cash Split
                                                  │
                                                  ▼
                                                 1E Certification
```

1D may start after 1B if account seed is ready, but **must not** certify before 1C transfer paths stop misusing 1010/1015.

---

## Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance / product owner | | | Approve / Request changes |
| Engineering lead | | | Approve / Request changes |
| Architecture | | | Approve / Request changes |
