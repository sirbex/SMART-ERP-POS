# PROOF: Permissions SSOT

- Date: 2026-08-04T22:22:00.336Z
- Runner: `npx vitest run src/__tests__/permissions-ssot.proof.test.ts`

## Results
- PASS inventory adjust SSOT keys
- PASS inventory adjust wiring
- PASS waiter vs manager/cashier service-lane access
- PASS service lane ensure gated to manage/pay
- PASS migration 578 service lane seed rows exist

## Verdict
**PASS** — inventory adjust SSOT + service lanes hidden from waiters (manage/pay only).
