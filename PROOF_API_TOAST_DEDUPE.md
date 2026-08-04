# PROOF: Global API toast anti-double-notify

- Run: 2026-08-04T05:51:36.410Z
- Command: `npx vitest run src/__tests__/api-toast-dedupe.proof.test.ts src/__tests__/errorHandler.spec.ts src/__tests__/access-denied-notification-proof.test.ts`
- Result: **PASS** — 22 pass / 0 fail / 22 total

## Objective

One user-visible API failure notification globally — interceptors notify once; page re-toasts suppressed

## Bug reproduced

Invalid request + No active recipe… plus second toast with the same body from page onError

## Fix SSOT

- markApiErrorNotified after interceptor / dispatch notify
- installGlobalApiToastDedupe patches react-hot-toast + sonner
- toastApiError / handleApiError skip HandledApiError

## Gates

- **PASS** R1-HandledApiError
- **PASS** R2-message-body — No active recipe for this product. Add ingredient lines manually or define a restaurant recipe first.
- **PASS** R3-app-api-error-dispatched — events=1
- **PASS** R4-suppress-flags
- **PASS** R5-zero-surface-display — displayed=0
- **PASS** R6-local-allowed — calls=1
- **PASS** R7-toastApiError-skip — calls=0
- **PASS** S1-markApiErrorNotified
- **PASS** S2-shouldSuppress
- **PASS** S3-install
- **PASS** S4-dispatch-mark
- **PASS** S5-module-install
- **PASS** S6-api-install
- **PASS** S7-api-brv
- **PASS** S8-api-403
- **PASS** S9-api-network
- **PASS** S10-main
- **PASS** S11-resilient
- **PASS** S12-app-listener
- **PASS** W1-json
- **PASS** W2-md
- **PASS** W3-all-passed — 0 failed of prior gates

## Artifacts

- `PROOF_API_TOAST_DEDUPE.json`
- `PROOF_API_TOAST_DEDUPE.md`

## Verdict

**PASS — certified** (runtime suppress + structural wiring). (runtime suppress + structural wiring).
