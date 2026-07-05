# Phase 2.5 — Deploy Checklist (AR Governance Warn Mode)

**Target:** Production (Henber) after Phase 2 code merge  
**Date started:** _______________  
**Operator:** _______________

---

## Pre-deploy (local / CI)

- [ ] `npm run test:accounting-governance` — PASS
- [ ] `npm run test:posting-integrity` — PASS
- [ ] `npm run test:accounting` — PASS (clean migrated DB)
- [ ] `npm run ci:posting-guardrails` — PASS (no blocking violations)
- [ ] Phase 2 code merged to `main` and deployed

Record CI run URL: _______________

---

## Production environment

Set on the **application server** (not database):

```bash
AR_GOVERNANCE_MODE=warn
```

**Unset or leave false:**

```bash
# AR_GOVERNANCE_ENFORCE=false          # default
# ACCOUNTING_JOURNAL_GOVERNANCE_ENFORCE=false
```

Restart API after env change. Confirm in startup logs:

```
AR governance mode: warn
```

(Or verify via `getArGovernanceMode()` in a health/diagnostic endpoint if added later.)

---

## Post-deploy smoke

- [ ] API health check OK
- [ ] One test credit sale posts GL with `entityType=customer` on 1200
- [ ] No `AR_GOVERNANCE_WARN` in logs from smoke transaction (expected: 0 warnings)
- [ ] `npm run proof:post-deploy-smoke` — PASS (if applicable)

---

## Observation window

| Milestone | Target date | Done |
|-----------|-------------|------|
| Warn mode live | | |
| Day 7 review | | |
| Day 14 minimum complete | | |
| Evidence report filed | | |

Daily/weekly: run warn log summary:

```bash
node scripts/summarize-ar-governance-warns.mjs SamplePOS.Server/logs/combined.log
```

Or on production server:

```bash
node scripts/summarize-ar-governance-warns.mjs /app/logs/combined.log
```

---

## Enforce gate (do not proceed until all checked)

- [ ] Observation window ≥ 14 days
- [ ] Zero unclassified `AR_GOVERNANCE_WARN` events
- [ ] `WARN_OBSERVATION_REPORT.md` completed and signed
- [ ] `test:accounting` re-run on clean DB post-deploy — PASS
- [ ] Finance sign-off

**Then only:**

```bash
AR_GOVERNANCE_MODE=enforce
```

Rollback if legitimate workflows blocked: set `warn` or `off` immediately.

---

## Related docs

- [PHASE_2_5_WARN_VALIDATION.md](../../docs/PHASE_2_5_WARN_VALIDATION.md)
- [POSTING_INTEGRITY_AR_SPEC.md](../../docs/POSTING_INTEGRITY_AR_SPEC.md)
