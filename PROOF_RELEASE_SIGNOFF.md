# Production Proof Snapshot — Warehouse Network Release

**Generated:** 2026-07-05T11:26Z  
**Merge commit:** `940a1b7cf324cd691f3890ac19c6fd06ffa0e95f`  
**Deployed commits (pushed):** `538f93a` (533 migration + tooling), `9ebe26f` (evidence archive)  
**Target:** https://henber.wizarddigital-inv.com

---

## Live checks (just verified)

| Check | Result |
|-------|--------|
| `GET /api/health` | **200** healthy |
| Tenant login (`admin@test.com`) | **PASS** |
| Governance dashboard | **200** — domains: ap, ar, inventory |
| Migration `533_financial_governance.sql` on Henber | **Applied** 2026-07-05 |
| Governance tables | financial_materiality_config, financial_reconciliation_snapshots, financial_period_close_signoffs, financial_integrity_alerts |
| Materiality seed | ap=default, ar=default, inventory=default |
| Latest governance snapshot | `f15c3d94-2b8a-4e92-ab4c-1b4edc9beb35` |

---

## Step 3 — Henber drift decomposition (re-run 2026-07-05)

| Script | Exit | integrityGlDrift |
|--------|------|------------------|
| AP decompose | **0** | **UGX 0.00** — PROOF PASSED |
| AR decompose | **0** | **UGX -52,800.00** — PROOF OK (known exception) |

**Artifacts:** `PROOF_AP_DRIFT_DECOMPOSE.md`, `PROOF_AR_DRIFT_DECOMPOSE.md`

---

## Step 4 — Post-deploy smoke (final run)

**Result:** ALL CHECKS PASSED (exit 0)  
**Log:** `release-evidence/post-deploy-smoke.log` (local; `*.log` gitignored)

Key passes: trial balance gap 0, AP Lane 1 RECONCILED, governance dashboard 200, framework baseline PASS.

---

## Evidence package (in repo)

| Item | Path | Status |
|------|------|--------|
| Release summary | `release-evidence/RELEASE_SUMMARY.md` | ✅ |
| Step 5 checklist | `release-evidence/STEP5_REVIEW_CHECKLIST.txt` | ✅ |
| AP proof | `PROOF_AP_DRIFT_DECOMPOSE.md` | ✅ |
| AR proof | `release-evidence/step3-henber-decompose/` | ✅ |
| Deploy log | `release-evidence/deploy-workflow.log` | ✅ (prior success on de7a834) |
| Readiness lock for 940a1b7 | `deploy-locks/` | ❌ not archived |

**Evidence check:** `node scripts/proof-release-evidence-check.mjs --commit 940a1b7` → 6/7 required PASS

---

## Accepted exceptions

1. **AR integrityGlDrift -52,800** — period-close blocked on AR (pre-existing)
2. **Readiness lock** — no JSON for merge SHA (pre-merge lock on 683f70d only)

---

## Deploy workflow (latest push)

**Status:** ✅ SUCCESS  
**Run:** https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/28739027157  
**Commit:** `9ebe26f5586c961292988a702d7014d0604a976f`  
**Includes:** `533_financial_governance.sql` applied to all tenants via deploy-update.sh

---

## Reproduce locally

```powershell
. .\scripts\load-proof-production-env.ps1
npm run proof:production-env-check
npm run proof:henber:ap-decompose
npm run proof:henber:ar-decompose
npm run proof:post-deploy-smoke
node scripts/proof-release-evidence-check.mjs --commit 940a1b7cf324cd691f3890ac19c6fd06ffa0e95f
```
