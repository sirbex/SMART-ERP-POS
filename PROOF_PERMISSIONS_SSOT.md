# PROOF: Permissions SSOT

- Date: 2026-08-05T02:31:41.594Z
- Runner: `npx vitest run src/__tests__/permissions-ssot.proof.test.ts`

## Results
- PASS inventory adjust SSOT keys
- PASS inventory adjust wiring
- PASS waiter vs manager/cashier service-lane access
- PASS service lane ensure gated to manage/pay
- PASS migration 578 service lane seed rows exist
- PASS cancel-check actor policy
- PASS cancel-check UI + route wiring

## Verdict
**PASS** — inventory adjust SSOT; service lanes for manage/pay; cancel check managers only.
