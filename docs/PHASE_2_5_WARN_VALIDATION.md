# Phase 2.5 — Production Warn Validation

**Status:** Ready to deploy after Phase 2 code merge  
**Prerequisite:** Phase 2 Priority 1 fixes deployed (`recordSaleRefundToGL`, `recordInvoicePaymentToGL`, deposit sale, refund `arCreditAmount`)  
**Goal:** Collect operational evidence that no production workflow generates AR governance violations before enabling enforcement.

---

## 1. Objectives

1. Run `AR_GOVERNANCE_MODE=warn` in production long enough to observe all AR-touching workflows under real load.
2. Prove that **zero unexpected violations** occur (or classify and resolve any that do).
3. Produce a signed evidence report before switching to `AR_GOVERNANCE_MODE=enforce`.

**Do not** pursue Priority 2 code changes (caller audit, legacy retirement) until warn validation completes — unless a warn violation identifies a specific defect.

---

## 2. Deployment

### 2.1 Environment variable

```bash
# Production / staging (observation)
AR_GOVERNANCE_MODE=warn

# Explicitly unset enforce flags during observation
# AR_GOVERNANCE_ENFORCE=false   (default)
# ACCOUNTING_JOURNAL_GOVERNANCE_ENFORCE=false
```

| Mode | Behavior |
|------|----------|
| `off` | No entity checks (pre-Phase 2 default) |
| `warn` | Log `AR_GOVERNANCE_WARN` events; **allow posting** |
| `enforce` | Reject with `PostingGovernanceError` |

### 2.2 Observation window

Minimum recommendation:

| Criterion | Threshold |
|-----------|-----------|
| Calendar duration | ≥ 14 days |
| Credit sales | ≥ 100 executions |
| Invoice payments | ≥ 50 executions |
| Refunds | ≥ 10 executions |
| Deposit sales | ≥ 5 executions (if applicable) |

Extend the window if volume is low or a major release ships mid-observation.

### 2.3 What warn does NOT change

- Posting still succeeds — no user-facing blocks.
- Historical untagged GL is untouched (Phase 4 backfill only).
- Heal/remediation scripts remain frozen.

---

## 3. Evidence collection

### 3.1 Log event shape

Every violation emits a structured warn log (`arJournalGovernance.ts`):

```json
{
  "event": "AR_GOVERNANCE_WARN",
  "code": "GOV_RULE_I_AR_ENTITY_REQUIRED",
  "message": "AR journal missing customer attribution...",
  "workflow": "refund",
  "referenceType": "SALE_REFUND",
  "referenceId": "<uuid>",
  "referenceNumber": "REF-001",
  "source": "SALES_REFUND",
  "idempotencyKey": "SALE_REFUND-<uuid>"
}
```

| Field | Purpose |
|-------|---------|
| Timestamp | Server log timestamp (UTC) |
| Tenant | Deployment / DB identifier (from ops context) |
| User | Trace from surrounding request audit if correlating manually |
| `workflow` | Inferred label: `credit_sale`, `refund`, `invoice_payment`, etc. |
| `referenceId` | Invoice / sale / payment UUID |
| `referenceNumber` | Human-readable document number |
| `code` | Governance rule code |
| `message` | Human-readable reason |

### 3.2 Log queries

**Combined log (local / file):**

```bash
rg '"event":"AR_GOVERNANCE_WARN"' SamplePOS.Server/logs/combined.log
```

**Count by workflow:**

```bash
rg '"event":"AR_GOVERNANCE_WARN"' combined.log \
  | rg -o '"workflow":"[^"]+"' \
  | sort | uniq -c | sort -rn
```

**Datadog / CloudWatch (adjust field names):**

```
@event:AR_GOVERNANCE_WARN
```

### 3.3 Per-warning capture template

For each warning during observation, record:

| Field | Value |
|-------|-------|
| Timestamp | |
| Tenant | |
| User (if known) | |
| Workflow | |
| Reference ID | |
| Reference number | |
| Governance code | |
| Classification | (see §4) |
| Resolution | |

---

## 4. Warning classification

Before enabling enforce, classify every warning:

| Class | Description | Action |
|-------|-------------|--------|
| **A — Legacy caller** | Untagged path not yet migrated in Phase 2 | Fix or document as temporary exception |
| **B — Application defect** | Bug in posting path | Hotfix before enforce |
| **C — Historical replay** | Import/repost of pre-fix data | Exclude from enforce gate; fix import path |
| **D — Authorized exception** | CUTOVER_OB, Migration 534 backfill, etc. | Document in exception register |
| **E — False positive** | Governance rule too strict | Adjust rule or add exception source |

**Enforce gate:** Classes A and B must be **zero** in production. C/D/E require written sign-off.

---

## 5. Observation report template

Produce at end of observation window. Save to `release-evidence/ar-governance-warn-<date>.md`.

### 5.1 Summary

| Workflow | Executions (est.) | Warnings | Notes |
|----------|-------------------|----------|-------|
| Credit sale | | 0 | |
| Invoice payment (legacy) | | 0 | |
| Invoice payment (SSOT) | | 0 | |
| Refund | | 0 | |
| Refund (zero-balance) | | 0 | |
| Deposit sale | | 0 | |
| Credit note | | 0 | |
| Debit note | | 0 | |
| Opening balance | | 0 | |
| Other | | 0 | |
| **Total** | | **0** | |

### 5.2 Sign-off checklist

- [ ] Observation window met (§2.2)
- [ ] Zero unclassified warnings
- [ ] All Class A/B warnings resolved (or observation extended)
- [ ] `npm run test:accounting` passed on clean DB (see §6)
- [ ] CI governance gates green on `main` (see §6)
- [ ] Finance / engineering sign-off recorded

**Signed by:** _______________ **Date:** _______________

---

## 6. CI gates (required before enforce)

These tests are **mandatory** for merges to `main` (`.github/workflows/accounting-integrity.yml`):

| Command | Coverage |
|---------|----------|
| `npm run test:accounting-governance` | `arJournalGovernance.test.ts`, AP rules, orchestrator |
| `npm run test:posting-integrity` | `postingIntegrity.ar.test.ts` — per-workflow AR proofs |
| `npm run test:accounting` | Full accounting regression on migrated DB |

Local pre-merge:

```bash
cd SamplePOS.Server
npm run test:accounting-governance
npm run test:posting-integrity
npm run test:accounting   # requires DATABASE_URL + migrations
```

---

## 7. When to enable enforce

Switch production to:

```bash
AR_GOVERNANCE_MODE=enforce
```

**Only when all are true:**

1. ✅ Warn observation complete with **no unexpected violations**
2. ✅ Accounting regression suite passed on clean database
3. ✅ CI includes governance + posting integrity tests (green on `main`)
4. ✅ Remaining legacy callers migrated **or** documented as temporary exceptions (Class D)
5. ✅ Historical untagged data scheduled for Phase 4 only — not generated by current code

**Rollback:** Set `AR_GOVERNANCE_MODE=warn` or `off` immediately if legitimate workflows are blocked.

---

## 8. Relationship to other phases

```
Phase 2    Fix posting paths (code)          ← complete
    ↓
Phase 2.5  Production warn validation          ← YOU ARE HERE
    ↓
Phase 3    Automated proof matrix in CI       ← partially done via postingIntegrity.ar.test.ts
    ↓
Phase 4    Migration 534 one-time backfill     ← historical metadata only
    ↓
Phase 5    Retire heal / repair tooling
```

**Sequence rationale:** Prevent new defects → prove prevention works → backfill historical metadata → retire repair tooling. Do not backfill while new violations are still possible.

---

## 9. Priority 2 deferral

The following are **explicitly deferred** until after Phase 2.5 sign-off:

- Full caller audit of `createJournalEntry` / all `record*` functions
- Legacy `recordInvoicePaymentToGL` retirement
- `cancelNote` txClient fix
- `glRepairService` AR repost hard-gate

Revisit only if warn mode surfaces a specific violation in those areas.
