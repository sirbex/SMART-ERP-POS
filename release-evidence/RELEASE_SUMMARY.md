# Release Summary — Multi-Store Warehouse Network (Phase 14)

**Release date:** 2026-07-05  
**Squash merge commit:** `940a1b7cf324cd691f3890ac19c6fd06ffa0e95f`  
**Deployed HEAD:** `de7a834fa1a1220adf2fe38f0d7032124462c7b0`  
**Target tenant:** https://henber.wizarddigital-inv.com  
**Release fingerprint (recommended tag):** `v2026.07-warehouse-network` → attach to `de7a834`

---

## Verdict

| Layer | Status | Evidence |
|-------|--------|----------|
| Engineering (code, tests, local gates) | **PROVEN** | Pre-merge readiness on `683f70d`; squash merge `940a1b7` |
| Deployment | **PROVEN** | Deploy workflow [28736954841](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28736954841) — success on `de7a834` |
| Operational (Henber reconciliation + prod smoke) | **PROVEN** | Steps 3–4 below; post-deploy smoke exit 0 |

**Production verified claim:** Supported for warehouse-network release on Henber, with **documented accepted exceptions** listed below. Period-close remains blocked on AR (pre-existing).

---

## Release steps completed

| Step | Description | Result |
|------|-------------|--------|
| 0 | Pre-merge gates (warehouse deploy gate, browser E2E, readiness lock on feature branch) | Done on `683f70d` (see commit message) |
| 1 | Squash merge `feature/warehouse-network-v1` → `main` | `940a1b7` — [evidence](step1-merge-940a1b7/) |
| 2 | Production deploy | Initial deploy **failed** on `940a1b7` ([run 28736346956](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28736346956)); fixed in `de7a834`; **success** ([run 28736954841](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28736954841)) |
| 3 | Henber AP + AR drift decomposition (production DB) | **PASS** — [summary](step3-henber-decompose/STEP3_SUMMARY.txt) |
| 4 | Post-deploy financial smoke (production API + DB) | **PASS** (exit 0) — [summary](step4-post-deploy-smoke/STEP4_SUMMARY.txt) |
| 5 | Review + release summary | This document |

---

## Step 3 — Henber financial decomposition

### AP (`proof-ap-drift-decompose.mjs`)

| Metric | Value |
|--------|-------|
| integrityGlDrift | **UGX 0.00** |
| Open-item vs GL supplier scope | Match (37,855,793) |
| Supplier cache vs subledger | 0.00 |
| Script exit | 0 |

**Artifact:** [PROOF_AP_DRIFT_DECOMPOSE.md](../PROOF_AP_DRIFT_DECOMPOSE.md) (also archived under `step3-henber-decompose/`)

### AR (`proof-ar-drift-decompose.mjs`)

| Metric | Value |
|--------|-------|
| integrityGlDrift | **UGX -52,800.00** |
| Customer cache vs open-item | 0.00 (healthy) |
| Script exit | 0 (proof arithmetic reconciles) |

**Artifact:** [PROOF_AR_DRIFT_DECOMPOSE.md](../PROOF_AR_DRIFT_DECOMPOSE.md)

---

## Step 4 — Post-deploy smoke (final run)

**Log:** [post-deploy-smoke.log](post-deploy-smoke.log)  
**Run:** 2026-07-05 ~11:03 UTC  
**Result:** `ALL CHECKS PASSED` (exit 0)

| Check | Result |
|-------|--------|
| `GET /api/health` | 200 healthy |
| Frontend AP lane bundle | Found (`ReconciliationPage-*.js`) |
| 22 financial routes registered | 401 (not 404) |
| Trial balance | Balanced (gap 0.00) |
| AP Lane 1 integrity | RECONCILED, diff=0 |
| AR Lane 1 integrity | DISCREPANCY, diff=-52,800 |
| AR Lane 2 cache | HEALTHY, diff=0 |
| Inventory Lane 1 | RECONCILED, diff=4,210 |
| Governance dashboard | **200** (fixed — see below) |
| Framework baseline (DB) | PASS |
| Governance snapshot | Captured `f15c3d94-2b8a-4e92-ab4c-1b4edc9beb35` |

**Period-close blocked domains:** `ar` (expected)

### Governance dashboard fix (during Step 4)

- **Symptom:** `GET .../governance/dashboard` → HTTP 500  
- **Cause:** `financial_materiality_config` table missing — migration existed only in `SamplePOS.Server/db/migrations/`, not in `shared/sql/` deploy path  
- **Remediation:** Applied `533_financial_governance.sql` to Henber; added to `shared/sql/` for future all-tenant deploys  
- **Re-run:** Step 4 passed fully after fix

---

## Accepted exceptions (documented)

These are **known, pre-existing, or non-blocking** for this release. None are regressions introduced by warehouse-network code.

| # | Domain | Item | Value / status | Release impact |
|---|--------|------|----------------|----------------|
| 1 | AR | integrityGlDrift | -52,800 UGX | Period-close **blocked on AR**; documented since stabilization cycle G2 |
| 2 | AR | Top entity gaps | case hospital (−2.6M entity GL gap), BOU (+137K), African Humanitarian (+166K) | Requires authorized GL/open-item alignment; not auto-healed |
| 3 | AP | STORED_BALANCE vs posted GL | 7,275,029 UGX stale cache | Cache maintenance; **not** integrityGlDrift |
| 4 | AP | Lane 3 journal audit diff | -913,285 | Legacy SQL parity; framework Lane 1 reconciled |
| 5 | Inventory | Lane 2 cache DRIFT | 59,484 | Lane 1 within materiality (4,210) |
| 6 | Inventory | Lane 3 audit diff | 733,084 | Non-blocking for Lane 1 sign-off |
| 7 | Ops | Readiness lock for merge SHA | No `deploy-locks/readiness-lock-940a1b7*.json` archived | Pre-merge lock on `683f70d` referenced in merge commit; post-merge lock not captured |
| 8 | Ops | Production warehouse gate / browser E2E | Not run against prod URLs | Optional evidence; local E2E proven pre-merge |
| 9 | Ops | `533_financial_governance.sql` | Manually applied to Henber only | **Pending commit + deploy** to roll out to all tenants |
| 10 | Ops | Smoke test credentials | Temporary password on `admin@test.com` for verification | Rotate after sign-off |

**No other exceptions** beyond the table above.

---

## Evidence package index

| Artifact | Path |
|----------|------|
| Merge commit SHA | [step1-merge-940a1b7/MERGE_COMMIT.txt](step1-merge-940a1b7/MERGE_COMMIT.txt) |
| Merge commit message | [step1-merge-940a1b7/COMMIT_MESSAGE.txt](step1-merge-940a1b7/COMMIT_MESSAGE.txt) |
| Henber AP decomposition | [PROOF_AP_DRIFT_DECOMPOSE.md](../PROOF_AP_DRIFT_DECOMPOSE.md) |
| Henber AR decomposition | [PROOF_AR_DRIFT_DECOMPOSE.md](../PROOF_AR_DRIFT_DECOMPOSE.md) |
| Post-deploy smoke log | [post-deploy-smoke.log](post-deploy-smoke.log) |
| Deploy workflow (success) | [deploy-workflow.log](deploy-workflow.log) |
| Step 3 summary | [step3-henber-decompose/STEP3_SUMMARY.txt](step3-henber-decompose/STEP3_SUMMARY.txt) |
| Step 4 summary | [step4-post-deploy-smoke/STEP4_SUMMARY.txt](step4-post-deploy-smoke/STEP4_SUMMARY.txt) |
| Step 5 review checklist | [STEP5_REVIEW_CHECKLIST.txt](STEP5_REVIEW_CHECKLIST.txt) |

---

## Pre-tag checklist (Step 6)

- [x] Merge commit recorded (`940a1b7`)
- [x] Production deploy successful (`de7a834`, workflow 28736954841)
- [x] Henber AP decompose: integrityGlDrift = 0
- [x] Henber AR decompose: arithmetic verified; -52,800 documented
- [x] Post-deploy smoke: exit 0
- [x] Governance dashboard: HTTP 200
- [x] Release summary with accepted exceptions
- [ ] Commit `533_financial_governance.sql` + proof tooling to `main` and deploy
- [ ] Archive readiness lock for deployed commit (optional gap)
- [ ] Create annotated tag `v2026.07-warehouse-network` on `de7a834`
- [ ] Rotate `admin@test.com` smoke password if desired

---

## Recommended tag command

```powershell
git checkout main
git pull
git tag -a v2026.07-warehouse-network de7a834fa1a1220adf2fe38f0d7032124462c7b0 -m "Multi-store warehouse network — Henber production verified (AR -52,800 documented exception)"
git push origin v2026.07-warehouse-network
```

Attach this `release-evidence/` folder and root `PROOF_*_DRIFT_DECOMPOSE.md` files to the tag release notes.
