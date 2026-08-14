# PROOF: Omitted VAT (sales.tax_restatement) client RBAC

- Date: 2026-08-14T07:38:53.289Z
- Runner: `npx vitest run src/__tests__/sale-tax-restatement-rbac.proof.test.ts`

## Results
- PASS SSOT seed profile matrix
- PASS legacy fallback ADMIN/MANAGER only
- PASS UI + client legacy map
- PASS API + SQL heal allow-list

## Verdict
**PASS** — manager/admin/accountant SSOT; cashier deny; UI/API/SQL aligned.
