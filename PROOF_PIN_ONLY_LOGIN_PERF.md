# PIN-only Quick Login Performance — Acceptance Proof

**Status:** VERIFIED (local evidence gates)  
**Date:** 2026-08-03  
**Problem:** After idle / FOH auto-logout, next PIN login on shared terminal felt frozen.  
**Cause:** `authenticateWithPinOnly` did **N sequential bcrypt.compare** + **N getPinAttempts** SQL.

## Code change under proof

| Area | Fix |
|------|-----|
| Server `authenticateWithPinOnly` | One `getActivePinLockoutUserIds` + `Promise.any` parallel `bcrypt.compare` |
| Client `QuickLoginScreen` | “Signing in…” UX; skip restaurant-enabled RTT when FOH path stashed |

## Evidence suites (must pass for accept)

### Server behavioral (Jest) — **7 tests**

File: `SamplePOS.Server/src/modules/auth/quickLoginService.pinOnly.evidence.test.ts`

| # | Case | Pass criteria |
|---|------|----------------|
| 1 | Single lockout query | `getActivePinLockoutUserIds` ×1; `getPinAttempts` ×0 |
| 2 | Last of 16 users match | Wall &lt; ½ sequential lower bound (40ms × 16) |
| 3 | Locked user skipped | Locked hash never compared |
| 4 | Match issues tokens | Correct user + `resetPinAttempts` + token pair |
| 5 | Untrusted device | Fail before bcrypt |
| 6 | No PIN users | `NO_USERS` |
| 7 | Structural gate | Source still has `Promise.any` + no N× `getPinAttempts` |

### Client structural (Vitest) — **4 tests**

File: `samplepos.client/src/__tests__/pin-only-login-perf.evidence.test.ts`

| # | Case |
|---|------|
| 1 | Signing-in feedback bound to `isLoading` |
| 2 | Stashed restaurant path skips enabled fetch |
| 3 | FOH auto-logout still hard-navs to `/quick-login` |
| 4 | Server parallel contract present |

## Run results

```
# Server
cd SamplePOS.Server
npm test -- src/modules/auth/quickLoginService.pinOnly.evidence.test.ts --no-coverage --forceExit
→ Test Suites: 1 passed; Tests: 7 passed

# Client
cd samplepos.client
npx vitest run src/__tests__/pin-only-login-perf.evidence.test.ts
→ Test Files: 1 passed; Tests: 4 passed
```

## Verdict

**ACCEPTABLE for merge/deploy only while the two suites above stay green.**  
No production live timing run in this artifact (mocked bcrypt delays prove parallel wall-time).

## Commands to re-verify

```bash
cd SamplePOS.Server && npm test -- src/modules/auth/quickLoginService.pinOnly.evidence.test.ts --no-coverage --forceExit
cd samplepos.client && npx vitest run src/__tests__/pin-only-login-perf.evidence.test.ts
```
