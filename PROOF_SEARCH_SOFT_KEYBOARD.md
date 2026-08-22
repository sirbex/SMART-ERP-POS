# PROOF: Search soft keyboard (behavioral)

- Date: 2026-08-22T07:53:55.096Z
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

## Verdict
**PASS** — behavioral policy: desktop types normally; touch auto-opens; blur safe.
