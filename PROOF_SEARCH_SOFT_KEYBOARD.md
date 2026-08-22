# PROOF: Search soft keyboard (behavioral)

- Date: 2026-08-22T11:57:58.350Z
- Runner: `npm run proof:soft-keyboard` (search section) or `npx vitest run src/__tests__/search-soft-keyboard.proof.test.ts`

## Policy
Behavioral tests only — grep/source-scan evidence is **not** accepted.

## Results
- PASS desktop policy
- PASS touch POS policy
- PASS hybrid policy
- PASS prefersAuto
- PASS key application
- PASS blur guard
- PASS layout inventory
- PASS search toggle visibility

## Verdict
**PASS** — behavioral policy: desktop types normally; touch auto-opens; toggle hidden on desktop; blur safe.
