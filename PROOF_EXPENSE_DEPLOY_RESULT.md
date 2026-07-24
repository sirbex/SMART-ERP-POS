# Expense deploy proof

**Verdict: PASS** (after migration repair)  
**Generated:** 2026-07-24T14:15Z

---

## Commits

| SHA | Title |
|-----|--------|
| `7193fd1c` | fix(expenses): category-GL accuracy, funded pay-from, SAP report columns |
| `b0835e66` | fix(expenses): make migration 561 name-safe for category seed |

**Production HEAD:** `b0835e66b56a6b8db29699f0d264f7451ae3b25a`

---

## Attempt 1 — FAIL (evidence retained)

| Gate | Result | Link |
|------|--------|------|
| CI/CD Pipeline | PASS | [30098394178](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30098394178) |
| Deploy to Production | **FAIL** | [30098394200](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30098394200) |

**Cause:** migration `561_expense_category_gl_consistency.sql` — `expense_categories_name_key` duplicate on `pos_tenant_dynamics` / `pos_tenant_henber_pharmacy` (`ON CONFLICT (code)` insufficient when display name already exists under an alias code).

**Partial apply before abort:** 561 OK on `pos_system`, `acme_store`, `blis`, `bliss_interior_ltd`. App containers **not** rebuilt.

---

## Attempt 2 — PASS

| Gate | Result | Link |
|------|--------|------|
| Expense proofs (17) | PASS | vitest expense-*-proof |
| CI/CD Pipeline | PASS | [30099114816](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30099114816) |
| Deploy to Production | **PASS** | [30099114912](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30099114912) |

### Deploy log evidence (`b0835e66`)

- Git on server: `b0835e66`
- `[pos_tenant_dynamics] OK 561_expense_category_gl_consistency.sql`
- `[pos_tenant_henber_pharmacy] OK 561_expense_category_gl_consistency.sql`
- `>>> Migrations complete`
- `>>> Backend health: OK`
- `>>> HTTPS health: OK`
- `✅ PRODUCTION DEPLOY COMPLETE`

---

## Reproduce

```powershell
gh run view 30099114912
gh run view 30098394200 --log-failed   # first failure archive

cd samplepos.client
npx vitest run `
  src/__tests__/expense-reports-sap-proof.test.ts `
  src/__tests__/expense-category-gl-proof.test.ts `
  src/__tests__/expenses-petty-ux-proof.test.ts
```
