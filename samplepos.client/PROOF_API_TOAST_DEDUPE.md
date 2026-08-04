# PROOF: Global API toast anti-double-notify

- Run: 2026-08-04T03:36:01.388Z
- Command: `npx vitest run src/__tests__/api-toast-dedupe.proof.test.ts src/__tests__/errorHandler.spec.ts src/__tests__/access-denied-notification-proof.test.ts`
- Result: **PASS** — 5 pass / 0 fail / 5 total

## Objective

One user-visible API failure notification globally — interceptors notify once; page re-toasts suppressed

## Bug reproduced

Invalid request + No active recipe… plus second toast with the same body from page onError

## Fix SSOT

- markApiErrorNotified after interceptor / dispatch notify
- installGlobalApiToastDedupe patches react-hot-toast + sonner
- toastApiError / handleApiError skip HandledApiError

## Gates

- **PASS** R6-local-allowed — calls=1
- **PASS** R7-toastApiError-skip — calls=0
- **PASS** W1-json
- **PASS** W2-md
- **PASS** W3-all-passed — 0 failed of prior gates

## Artifacts

- `PROOF_API_TOAST_DEDUPE.json`
- `PROOF_API_TOAST_DEDUPE.md`

## Verdict

**PASS — certified** (runtime suppress + structural wiring). (runtime suppress + structural wiring).
