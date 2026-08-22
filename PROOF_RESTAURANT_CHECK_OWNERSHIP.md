# PROOF: Restaurant check ownership (behavioral)

- Date: 2026-08-22T07:54:00.650Z
- Runner: `npx vitest run src/__tests__/restaurant-check-ownership.proof.test.ts`

## Policy
Behavioral tests only — grep/source-scan evidence is **not** accepted.

## Results
- PASS waiter blocked
- PASS legacy cashier
- PASS RBAC Admin role name
- PASS admin role name SSOT
- PASS admin.* permissions

## Verdict
**PASS** — waiters blocked on peer tables; admin RBAC roles and cashiers override ownership.
