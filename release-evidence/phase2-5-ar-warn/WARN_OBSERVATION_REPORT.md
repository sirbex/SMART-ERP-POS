# AR Governance Warn Observation Report

**Tenant:** _______________  
**Observation start:** _______________  
**Observation end:** _______________  
**AR_GOVERNANCE_MODE:** `warn`  
**Deployed commit:** _______________

---

## 1. Executive summary

| Metric | Value |
|--------|-------|
| Total `AR_GOVERNANCE_WARN` events | |
| Unclassified warnings | |
| Class A (legacy caller) | |
| Class B (application defect) | |
| Class C (historical replay) | |
| Class D (authorized exception) | |
| Class E (false positive) | |
| **Recommendation** | ☐ Proceed to enforce ☐ Extend observation ☐ Fix defects first |

---

## 2. Workflow matrix

| Workflow | Executions (est.) | Warnings | Pass |
|----------|-------------------|----------|------|
| Credit sale | | 0 | ☐ |
| Invoice payment (legacy) | | 0 | ☐ |
| Invoice payment (SSOT) | | 0 | ☐ |
| Refund | | 0 | ☐ |
| Refund (zero-balance) | | 0 | ☐ |
| Deposit sale | | 0 | ☐ |
| Credit note | | 0 | ☐ |
| Debit note | | 0 | ☐ |
| Opening balance | | 0 | ☐ |
| Other | | 0 | ☐ |
| **Total** | | **0** | |

_Generate workflow counts from: `node scripts/summarize-ar-governance-warns.mjs <logfile>`_

---

## 3. Warning detail log

| Timestamp | Workflow | Reference ID | Reference # | Code | Classification | Resolution |
|-----------|----------|--------------|-------------|------|----------------|------------|
| | | | | | | |

---

## 4. Pre-enforce verification

- [ ] `npm run test:accounting-governance` — PASS on `main`
- [ ] `npm run test:posting-integrity` — PASS on `main`
- [ ] `npm run test:accounting` — PASS on clean migrated DB (date: ______)
- [ ] No new untagged 1200 entries since Phase 2 deploy (spot-check query)
- [ ] Historical remediation scripts remain frozen

---

## 5. Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering | | | |
| Finance | | | |

**Enforce authorized:** ☐ Yes — set `AR_GOVERNANCE_MODE=enforce` on ______  
**Enforce deferred:** ☐ No — reason: _______________
