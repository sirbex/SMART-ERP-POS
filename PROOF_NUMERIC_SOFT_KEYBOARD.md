# PROOF: Numeric soft keyboard (behavioral)

- Date: 2026-08-22T11:57:58.358Z
- Runner: `npm run proof:soft-keyboard` (numeric section) or `npx vitest run src/__tests__/numeric-soft-keyboard.proof.test.ts`

## Policy
Behavioral tests only — grep/source-scan evidence is **not** accepted.

## Results
- PASS shared policy
- PASS numeric key application
- PASS integer mode
- PASS parse
- PASS context override
- PASS blur guard
- PASS toggle visibility policy
- PASS toggle layout SSOT

## Verdict
**PASS** — numeric pad logic + shared touch/PC policy; toggle layout SSOT; blur safe.
