# Expense deploy proof — `7193fd1c`

**Generated:** 2026-07-24T13:55Z  
**Commit:** `7193fd1c32b231e6f01949c85d66cc57fd40ca29`  
**Title:** fix(expenses): category-GL accuracy, funded pay-from, SAP report columns  
**Verdict: FAIL — production deploy did not complete**

---

## Gate summary

| Gate | Result | Evidence |
|------|--------|----------|
| Expense proofs (17) | **PASS** (pre-push) | `expense-*-proof.test.ts` |
| CI/CD Pipeline | **PASS** | [run 30098394178](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30098394178) |
| Accounting Integrity workflow | **FAIL** (unrelated guardrail) | [run 30098394211](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30098394211) — `henber-fix-acculife-scn-payment.mjs` posting guardrail |
| Deploy to Production | **FAIL** | [run 30098394200](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30098394200) |

---

## What succeeded on the server before abort

- Git fast-forward on prod: `9306ba1b` → `7193fd1c`
- Pre-deploy snapshot: `/opt/smarterp/deploy-snapshots/snapshot-20260724-134907.json`
- Migration **561** applied OK on:
  - `pos_system`
  - `pos_tenant_acme_store`
  - `pos_tenant_blis`
  - `pos_tenant_bliss_interior_ltd`
- `pos_template` skipped (refreshed from pos_system)

## What failed

Migration **561** on:

| DB | Error |
|----|--------|
| `pos_tenant_dynamics` | `duplicate key value violates unique constraint "expense_categories_name_key"` — Key `(name)=(Professional Services)` |
| `pos_tenant_henber_pharmacy` | same constraint — Key `(name)=(Utilities)` |

Root cause: `INSERT … ON CONFLICT (code) DO NOTHING` still inserts a **new code** (`PROFESSIONAL` / short names) when an existing row already owns the same **display name** under another code (`PROFESSIONAL_SERVICES`, etc.).

Deploy script **stopped before** backend/frontend rebuild → app containers remain on prior image; migration incomplete on 2 tenants.

---

## Fix required before re-deploy

1. Make 561 category seed skip when **code OR name** already exists (done in follow-up commit).
2. Re-run Deploy to Production for `7193fd1c`+fix (or push fix commit).
3. Confirm migration 561 on dynamics + henber, then container rebuild + HTTPS health.
4. Post-deploy smoke + expense mark-paid / reports manual check.

---

## Reproduce / watch

```powershell
gh run view 30098394200 --log-failed
gh run list --branch main --limit 5
```
