# Permanent guarantee — Session death → Login

| Field | Value |
|-------|--------|
| **Invariant** | `INVARIANT_SESSION_DEATH_LOGIN_v1` |
| **Last proof** | 2026-08-15T05:37:25.086Z |
| **Verdict** | **PASS** |
| **Gates** | 54/54 |

## Promise

This application **must never** leave an authenticated SPA shell after server-side session death.
Definitive auth failure always hard-navigates to Login (same tab + peers).
Network / 5xx blips do not force logout.

## Enforcement (cannot be a soft test)

1. Vitest permanent lock: `src/__tests__/session-death-login.invariant.lock.test.ts`
2. Behavioral proof: `src/__tests__/session-force-login-redirect.proof.test.ts`
3. CI job **session-death-login-invariant** (hard fail — no continue-on-error)
4. Source tokens `INVARIANT_SESSION_DEATH_LOGIN_v1` required in policy / forceLogout / broadcast modules

## Seal

This file is regenerated only by the permanent lock suite.  
If CI merges when this is **FAIL**, process has been bypassed.
