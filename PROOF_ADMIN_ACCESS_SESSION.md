# Proof — Admin Access + Session-Expired Banner

**Generated:** 2026-07-10T10:44:30.163Z (post-deploy re-run)  
**Commit:** `a7b86c8` (`fix(auth): restore ADMIN full access and stop session-expired banner flicker`)  
**Deploy:** [GitHub Actions 29086451039](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/29086451039) — **SUCCESS**  
**Target:** https://henber.wizarddigital-inv.com  
**Runner:** `npm run proof:admin-access-session`

---

## Verdict: **PASS — 23/23**

| Suite | Result |
|-------|--------|
| A. Session-expired banner policy (unit) | **4/4 PASS** |
| B. Jest ADMIN always-allow + systemRoleGrants | **13 tests PASS** |
| C. Live Henber admin@test.com API (zero 403) | **12/12 PASS** |
| D. Henber DB grant coverage (534/535) | **4/4 PASS** |
| E. API health | **PASS** |

Also: `npm run proof:authorization-phases` → **31 static + 91 tests PASS** (same session).

---

## A. Session-expired banner (why it was clearing)

**Bug:** Login page read + removed `sessionStorage.session_expired` on every render → banner vanished on re-render (mobile focus/resize).

**Fix:** Capture once via `useState(() => …)` in `LoginPage.tsx`.

| Assertion | Result |
|-----------|--------|
| Fixed: first capture shows banner | PASS |
| Fixed: banner state survives re-render | PASS |
| Fixed: storage flag cleared once | PASS |
| Buggy pattern: second render loses banner | PASS (documents old failure: first=true, second=false) |

---

## B. ADMIN always-allow (unit)

Jest: `authorizationService.test.ts` + `systemRoleGrants.test.ts` — **13 passed**.

Includes: `ADMIN legacy role always allows even without useLegacyFallback` (partial permission set still grants `sales.void` / `accounting.post`).

---

## C. Live Henber — `admin@test.com`

| Check | Result |
|-------|--------|
| Login | **200**, role=`ADMIN` |
| Permissions | **130** keys |
| `/api/sales` | **200** |
| `/api/products` | **200** |
| `/api/customers` | **200** |
| `/api/accounting/trial-balance` | **200** |
| `/api/erp-accounting/reconciliation/financial-health` | **200** |
| `/api/rbac/roles` | **200** |
| `/api/suppliers` | **200** |
| `/api/inventory/stock-levels` | **200** |
| **403 count** | **0** |

---

## D. Henber DB grants (already applied)

| Check | Result |
|-------|--------|
| Administrator perms ≥ catalog | **117 ≥ 116** (migration 535) |
| Manager has `accounting.read` | **YES** (migration 534) |
| Accountant has `customers.update` | **YES** (migration 534) |
| ADMIN+Administrator users | `kitaramercy1@gmail.com` (now covered by full Administrator catalog + ADMIN always-allow in code) |

---

## Reproduce

```powershell
. .\scripts\load-proof-production-env.ps1
node SamplePOS.Server/scripts/proof-admin-access-session.mjs
npm run proof:authorization-phases
```

Exit code **0** required for acceptance.
