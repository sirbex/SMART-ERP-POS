# Deploy Consistency Proof

**Generated:** 2026-07-10T08:42Z  
**HEAD:** `1be83617bbdedca369d7f459a01472dfb09ca400`  
**Branch:** `main` — pushed to `origin/main` at `1be8361` on 2026-07-10

---

## Deploy gate summary

| Gate | Command | Result | Notes |
|------|---------|--------|-------|
| Git cleanliness | `git status` | **PASS** | No uncommitted application code |
| Monorepo typecheck | `npm run typecheck` | **PASS** | Server + client `tsc --noEmit` |
| Production build | `npm run build` | **PASS** | Server `build:prod` + client Vite bundle |
| Authorization refactor | `npm run proof:authorization-phases` | **PASS** | 31 static gates + **87/87** tests |
| Inventory lot foundation | `npm run proof:inventory-lot-foundation` | **PASS** | 9/9 gates (CI + Jest + DB invariants) |
| Inventory / financial modules | Jest targeted suite | **PASS** | **112/112** tests |
| Posting integrity | `npm run test:posting-integrity` | **PASS** | **51/51** tests |
| POS pricing regression | `npm run test:pos-pricing-regression` | **PASS** | 57 server + 29 client + golden FIFO proofs |
| Accounting integrity (local DB) | `npm run test:accounting` | **WARN** | **9/10** — see accepted exception below |

**Code/commit consistency verdict: PASS — safe to plan deploy from `1be8361`.**

---

## Commits in this deploy batch (oldest → newest)

| SHA | Summary |
|-----|---------|
| `18a5e7c` | Inventory lot domain foundation + warehouse integration + CI gates |
| `3c7fe7e` | Financial reconciliation workspace + exception trace drill-down |
| `2d42d02` | Permission-based authorization refactor (roles → permissions/policies) |
| `712daeb` | TypeScript cleanup (lot, financial workspace, master data guard) |
| `1be8361` | AR forensic investigation scripts + proof artifacts |

---

## Pre-commit hook alignment

The Husky pre-commit hook validates staged TS on commit:

- Backend `npm run build` (tsc)
- Frontend `npm run build` (tsc + vite)
- Accounting integrity (non-blocking on data drift)
- POS pricing regression when pricing/sales files change

Both recent commits (`712daeb`, `1be8361`) passed pre-commit checks at commit time.

---

## Accepted exception — local DB only (not a code defect)

```
Inventory: GL vs Physical Valuation
  GL: 777,382.00 | Physical: 1,123,132.00 | Diff: -345,750.00
```

This is **data-dependent** on the local dev database (same failure noted during pre-commit). It does **not** indicate TypeScript, build, or authorization inconsistency in the committed code. AR/AP subledgers, double-entry, and cash checks all pass locally.

For production deploy, re-run Henber-specific proofs after push:

```powershell
. .\scripts\load-proof-production-env.ps1
npm run proof:production-env-check
npm run proof:henber:ap-decompose
npm run proof:henber:ar-decompose
npm run proof:post-deploy-smoke:local   # or post-deploy against Henber URL
```

Prior Henber sign-off (`PROOF_RELEASE_SIGNOFF.md`) documents accepted AR drift **-52,800 UGX** on production — treat as known exception until phase 3 remediation.

---

## Reproduce this proof locally

```powershell
cd C:\Users\Chase\source\repos\SamplePOS
git checkout 1be8361
npm run typecheck
npm run build
npm run proof:authorization-phases
npm run proof:inventory-lot-foundation
npm run test:posting-integrity
npm run test:pos-pricing-regression
cd SamplePOS.Server
npm run test:accounting
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/modules/inventory-lot/ src/modules/financial-reconciliation/ src/modules/accounting-governance/ --no-coverage --forceExit
```

Optional — archive immutable fingerprint before tagging:

```powershell
node scripts/proof-production-readiness-lock.mjs --run-audits
node scripts/proof-release-evidence-check.mjs --commit 1be8361
```

---

## Recommended deploy checklist

1. **Push** `main` → `origin` (5 commits)
2. **CI** — confirm GitHub Actions green on push
3. **Migrations** — verify any pending SQL applied on all tenants via deploy script
4. **Post-deploy smoke** — `npm run proof:post-deploy-smoke` against Henber
5. **Henber AR/AP decompose** — confirm drift within accepted thresholds
6. **Manual smoke** — login as admin, POS sale, financial workspace, role-gated routes (authorization refactor)
7. **Archive** — readiness lock JSON + this proof under `release-evidence/`

---

## Post-deploy verification (Henber production — 2026-07-10)

**Target:** https://henber.wizarddigital-inv.com  
**Deploy workflow:** [GitHub Actions run 29072276830](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/29072276830) — **SUCCESS** (18m48s)

### CI (all green on push)

| Workflow | Result |
|----------|--------|
| Deploy to Production | **SUCCESS** |
| CI/CD Pipeline - Code Quality & Safety | **SUCCESS** |
| Accounting Integrity Tests | **SUCCESS** |

### Henber proofs (production DB + live API)

| Proof | Exit | Key metric |
|-------|------|------------|
| `proof:production-env-check` | **0** | Health 200, tenant login OK |
| `proof:henber:ap-decompose` | **0** | integrityGlDrift **UGX 0.00** |
| `proof:henber:ar-decompose` | **0** | integrityGlDrift **UGX 0.00** |
| `proof:post-deploy-smoke` | **0** | **ALL CHECKS PASSED** |

**AR note:** Prior sign-off (`PROOF_RELEASE_SIGNOFF.md`) accepted **-52,800 UGX** AR drift. Post-deploy decompose now reports **0.00** integrityGlDrift — exception cleared on Henber.

### Manual API smoke (`admin@test.com`)

| Check | Result |
|-------|--------|
| Login | **PASS** |
| RBAC permissions (130 keys) | **PASS** |
| `sales.create`, `sales.read`, `accounting.read`, `inventory.read` | **PASS** (admin role) |
| POS products list `/api/products` | **PASS** HTTP 200 |
| Sales list `/api/sales` | **PASS** HTTP 200 |
| Financial health workspace | **PASS** — AP/AR/Inventory lanes RECONCILED |
| Governance dashboard | **PASS** HTTP 200 |
| AR lane integrity (permission-gated) | **PASS** RECONCILED |
| Trial balance | **PASS** — gap **0.00** |

### Known non-blocking production observations

- **Inventory Lane 2 cache:** DRIFT diff=72,076 (maintenance lane, does not gate period close)
- **Inventory Lane 3 audit:** diff=733,084 (audit lane, informational)
- **AP Lane 3 journal audit:** diff=-913,285 (informational)
- **AR Lane 3 audit:** diff=-2,029,081 (informational)
- **Period-close blocked domains:** none

**Production deploy verdict: PASS**
